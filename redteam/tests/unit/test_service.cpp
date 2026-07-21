#include <gtest/gtest.h>

#include <map>
#include <memory>
#include <string>

#include "adapters/driven/fs/InMemoryFileSource.hpp"
#include "adapters/driven/llm/FakeBackend.hpp"
#include "adapters/driving/cli/JsonReportWriter.hpp"
#include "app/RedTeamServiceImpl.hpp"

using namespace redteam;

namespace {
RedTeamServiceImpl make_service(std::map<std::string, std::string> files) {
  auto fs_factory = [files](const ProjectSpec& p) -> std::unique_ptr<FileSource> {
    return std::make_unique<InMemoryFileSource>(files, p);
  };
  auto be_factory = [](const BackendSpec&) -> std::unique_ptr<LlmBackend> {
    return std::make_unique<FakeBackend>();
  };
  return RedTeamServiceImpl(fs_factory, be_factory);
}

Request req_for(std::string root) {
  Request r;
  r.project.root = std::move(root);
  r.project.include = {"**/*"};
  r.signals.user_prompt = "run shell commands from user input";
  r.limits.max_findings = 20;
  return r;
}
}  // namespace

TEST(Service, EndToEndProducesReportWithFindings) {
  auto svc = make_service(
      {{"app.py",
        "import os\n"
        "from flask import request\n"
        "def ping():\n"
        "    os.system('ping ' + request.args.get('h'))\n"}});
  Report rep = svc.run(req_for("/virtual"));
  EXPECT_EQ(rep.run.stats.files, 1);
  EXPECT_GT(rep.run.stats.regions, 0);
  ASSERT_FALSE(rep.findings.empty());
  EXPECT_EQ(rep.findings.front().category, Category::CommandInjection);
  // every finding routes a fix request back to the main agent
  for (const auto& f : rep.findings) {
    EXPECT_EQ(f.fix_request.target, "main_agent");
    EXPECT_FALSE(f.location.file.empty());
  }
}

TEST(Service, SerializationIsByteReproducible) {
  auto files = std::map<std::string, std::string>{
      {"app.py",
       "import os\n"
       "def run(cmd):\n"
       "    os.system(cmd)\n"}};
  Report a = make_service(files).run(req_for("/virtual"));
  Report b = make_service(files).run(req_for("/virtual"));
  EXPECT_EQ(write_report_json(a, false), write_report_json(b, false));
}

TEST(Service, DeterministicRunIdFromSignals) {
  auto svc = make_service({{"a.py", "x = 1\n"}});
  Report a = svc.run(req_for("/virtual"));
  Report b = svc.run(req_for("/virtual"));
  EXPECT_EQ(a.run.id, b.run.id);
  EXPECT_FALSE(a.run.id.empty());
}
