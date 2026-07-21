#include <gtest/gtest.h>

#include <map>
#include <memory>
#include <string>

#include "adapters/driven/fs/InMemoryFileSource.hpp"
#include "adapters/driven/llm/FakeBackend.hpp"
#include "adapters/driven/llm/ProbeResponseParser.hpp"
#include "domain/FindingSynthesizer.hpp"
#include "domain/ProbePlanner.hpp"
#include "app/RedTeamServiceImpl.hpp"

using namespace redteam;

// ---- probe response parsing -------------------------------------------------

TEST(ProbeParser, ParsesFindingsArray) {
  const std::string text =
      R"({"findings":[{"vulnerable":true,"category":"command-injection",)"
      R"("severity":"critical","confidence":0.9,"line":5,"title":"t",)"
      R"("rationale":"r","suggested_fix":"f"}]})";
  ProbeResponse pr = parse_probe_response_json(text);
  ASSERT_TRUE(pr.ok);
  ASSERT_EQ(pr.verdicts.size(), 1u);
  EXPECT_EQ(pr.verdicts[0].category, Category::CommandInjection);
  EXPECT_EQ(pr.verdicts[0].severity, Severity::Critical);
  EXPECT_EQ(pr.verdicts[0].line, 5);
}

TEST(ProbeParser, ToleratesProseAndFences) {
  const std::string text =
      "Here is my analysis:\n```json\n{\"findings\":[]}\n```\nDone.";
  ProbeResponse pr = parse_probe_response_json(text);
  EXPECT_TRUE(pr.ok);
  EXPECT_TRUE(pr.verdicts.empty());
}

TEST(ProbeParser, MalformedIsNotOk) {
  ProbeResponse pr = parse_probe_response_json("not json at all");
  EXPECT_FALSE(pr.ok);
}

// ---- synthesizer verification/hardening ------------------------------------

TEST(FindingSynthesizer, DropsCategorylessAndMergesWithHeuristic) {
  Region r;
  r.id = "R1";
  r.file = "app.py";
  r.function = "ping";
  r.span = SourceSpan{"app.py", 1, 10};
  r.code = "def ping():\n    os.system(x)\n";

  Probe p;
  p.task_id = "t-R1";
  p.region_id = "R1";
  p.category = Category::CommandInjection;

  Finding heuristic;
  heuristic.location = SourceSpan{"app.py", 2, 2};
  heuristic.category = Category::CommandInjection;
  heuristic.severity = Severity::High;
  heuristic.confidence = 0.6;
  heuristic.source = FindingSource::Heuristic;
  heuristic.region_id = "R1";

  ProbeResponse resp;
  resp.task_id = "t-R1";
  resp.ok = true;
  LlmVerdict v;
  v.vulnerable = true;
  v.category = Category::CommandInjection;
  v.severity = Severity::Critical;
  v.confidence = 0.95;
  v.line = 999;  // out of range: must snap to the heuristic line, not crash
  resp.verdicts.push_back(v);

  auto out = synthesize_findings({p}, {resp}, {r}, {heuristic}, 50);
  ASSERT_EQ(out.size(), 1u);  // merged, not duplicated
  EXPECT_EQ(out[0].source, FindingSource::Both);
  EXPECT_EQ(out[0].severity, Severity::Critical);   // LLM upgraded
  EXPECT_EQ(out[0].location.start_line, 2);         // deterministic line kept
  EXPECT_EQ(out[0].status, FindingStatus::Confirmed);
}

TEST(FindingSynthesizer, IgnoresNonVulnerableVerdicts) {
  Region r;
  r.id = "R1";
  r.file = "a.py";
  r.span = SourceSpan{"a.py", 1, 3};
  r.code = "def f():\n    return 1\n";
  Probe p;
  p.task_id = "t-R1";
  p.region_id = "R1";
  p.category = Category::CommandInjection;
  ProbeResponse resp;
  resp.task_id = "t-R1";
  resp.ok = true;
  LlmVerdict v;
  v.vulnerable = false;
  v.category = Category::CommandInjection;
  resp.verdicts.push_back(v);
  auto out = synthesize_findings({p}, {resp}, {r}, {}, 50);
  EXPECT_TRUE(out.empty());
}

// ---- planner ---------------------------------------------------------------

TEST(ProbePlanner, RedactsSecretsInSlice) {
  Region r;
  r.id = "R1";
  r.file = "c.py";
  r.span = SourceSpan{"c.py", 1, 2};
  r.code = "API_KEY = \"NOT_A_REAL_SECRET_FOR_TESTS\"\n";
  RankedRegion rr;
  rr.region_id = "R1";
  rr.file = "c.py";
  rr.categories = {Category::SecretExposure};
  auto probes = plan_probes({rr}, {r}, 10);
  ASSERT_EQ(probes.size(), 1u);
  EXPECT_EQ(probes[0].task_id, "t-R1");
  EXPECT_NE(probes[0].code_slice.find("<redacted>"), std::string::npos);
  EXPECT_EQ(probes[0].code_slice.find("NOT_A_REAL_SECRET"), std::string::npos);
}

// ---- service with a canned backend -----------------------------------------

TEST(Service, ProbingUpgradesFindingToBoth) {
  std::map<std::string, std::string> files = {
      {"app.py",
       "import os\n"
       "def ping():\n"
       "    os.system('ping ' + host)\n"}};
  auto fs_factory = [files](const ProjectSpec& p) -> std::unique_ptr<FileSource> {
    return std::make_unique<InMemoryFileSource>(files, p);
  };
  // The region containing os.system is R1; the FakeBackend answers its probe.
  std::map<std::string, std::string> canned = {
      {"t-R1",
       R"({"findings":[{"vulnerable":true,"category":"command-injection",)"
       R"("severity":"critical","confidence":0.95,"line":3,)"
       R"("rationale":"user input reaches os.system","suggested_fix":"use argv"}]})"}};
  auto be_factory = [canned](const BackendSpec&) -> std::unique_ptr<LlmBackend> {
    return std::make_unique<FakeBackend>(canned);
  };

  RedTeamServiceImpl svc(fs_factory, be_factory, default_probe_parser());
  Request req;
  req.project.root = "/virtual";
  req.project.include = {"**/*"};
  req.signals.user_prompt = "run shell command from input";
  req.limits.max_findings = 20;

  Report rep = svc.run(req);
  EXPECT_GT(rep.run.stats.probes, 0);
  ASSERT_FALSE(rep.findings.empty());
  const Finding& top = rep.findings.front();
  EXPECT_EQ(top.category, Category::CommandInjection);
  EXPECT_EQ(top.source, FindingSource::Both);
  EXPECT_EQ(top.severity, Severity::Critical);
  EXPECT_EQ(top.suggested_fix, "use argv");  // LLM fix wins on merge
}
