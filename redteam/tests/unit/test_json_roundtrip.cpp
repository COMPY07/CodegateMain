#include <gtest/gtest.h>

#include <string>

#include "adapters/driving/cli/JsonReportWriter.hpp"
#include "adapters/driving/cli/JsonRequestParser.hpp"

using namespace redteam;

TEST(JsonRoundTrip, ParsesRequestFields) {
  const std::string raw = R"json({
    "schema_version": "1.0",
    "signals": {
      "user_prompt": "harden upload",
      "goals": ["a", "b"],
      "model_output": "os.system(cmd)",
      "coding_flow": {
        "functions": [
          {"file": "src/upload.py", "name": "handle", "complex": true,
           "span": {"start_line": 10, "end_line": 60},
           "sources": [{"line": 12, "kind": "http_body"}],
           "sinks": [{"line": 42, "kind": "os_system"}],
           "edges": [{"from_line": 12, "to_line": 42, "sanitized": false}]}
        ]
      },
      "security_hints": [
        {"file": "src/upload.py", "function": "handle",
         "possibility": 0.8, "priority": 1, "risk": "high"}
      ]
    },
    "project": {"root": "/p", "include": ["**/*.py"], "exclude": ["build/**"],
                "changed_files": ["src/upload.py"], "max_file_bytes": 2048},
    "backend": {"kind": "fake", "fake": {"fixtures": "fx"}},
    "limits": {"max_regions": 10, "max_probes": 5},
    "config": {"weights": {"complexity": 0.6}, "min_severity": "medium"}
  })json";

  ParsedRequest p = parse_request_json(raw);
  ASSERT_TRUE(p.ok) << p.error;
  const Request& r = p.request;

  EXPECT_EQ(r.signals.user_prompt, "harden upload");
  ASSERT_EQ(r.signals.goals.size(), 2u);
  EXPECT_EQ(r.signals.model_output, "os.system(cmd)");
  ASSERT_TRUE(r.signals.coding_flow.has_value());
  ASSERT_EQ(r.signals.coding_flow->functions.size(), 1u);
  const auto& fn = r.signals.coding_flow->functions[0];
  EXPECT_TRUE(fn.complex);
  EXPECT_EQ(fn.span.start_line, 10);
  ASSERT_EQ(fn.sources.size(), 1u);
  EXPECT_EQ(fn.sources[0].kind, "http_body");
  ASSERT_EQ(fn.edges.size(), 1u);
  EXPECT_FALSE(fn.edges[0].sanitized);

  ASSERT_EQ(r.signals.security_hints.size(), 1u);
  EXPECT_EQ(r.signals.security_hints[0].priority, 1);
  EXPECT_DOUBLE_EQ(r.signals.security_hints[0].possibility, 0.8);

  EXPECT_EQ(r.project.root, "/p");
  ASSERT_EQ(r.project.include.size(), 1u);
  EXPECT_EQ(r.project.max_file_bytes, 2048u);
  EXPECT_EQ(r.backend.kind, "fake");
  EXPECT_EQ(r.backend.fake.fixtures, "fx");
  EXPECT_EQ(r.limits.max_regions, 10);
  EXPECT_EQ(r.config.min_severity, Severity::Medium);
  EXPECT_DOUBLE_EQ(r.config.weights.at("complexity"), 0.6);
}

TEST(JsonRoundTrip, DefaultsForMissingFields) {
  ParsedRequest p = parse_request_json(R"({"project": {"root": "/x"}})");
  ASSERT_TRUE(p.ok) << p.error;
  EXPECT_EQ(p.request.schema_version, "1.0");
  EXPECT_EQ(p.request.backend.kind, "fake");
  EXPECT_EQ(p.request.limits.max_findings, 100);
  EXPECT_EQ(p.request.config.min_severity, Severity::Low);
  EXPECT_FALSE(p.request.signals.coding_flow.has_value());
}

TEST(JsonRoundTrip, InvalidJsonReportsError) {
  ParsedRequest p = parse_request_json("{not valid");
  EXPECT_FALSE(p.ok);
  EXPECT_FALSE(p.error.empty());
}

TEST(JsonRoundTrip, ReportSerializationIsDeterministic) {
  Report rep;
  rep.run.id = "rt-abc";
  rep.run.backend = "fake";
  rep.run.stats.files = 3;
  rep.intent_profile[Category::CommandInjection] = 0.8;

  Finding f;
  f.id = "RT-0001";
  f.location = SourceSpan{"src/upload.py", 42, 42};
  f.function = "handle";
  f.category = Category::CommandInjection;
  f.cwe = {"CWE-78"};
  f.severity = Severity::Critical;
  f.confidence = 0.92;
  f.source = FindingSource::Both;
  f.status = FindingStatus::Confirmed;
  f.title = "shell injection";
  f.evidence.code_slice = "os.system(cmd)";
  f.evidence.signals = {"sink:os_system"};
  f.suggested_fix = "use argv";
  f.fix_request.priority = 1;
  rep.findings.push_back(f);

  const std::string a = write_report_json(rep, /*pretty=*/false);
  const std::string b = write_report_json(rep, /*pretty=*/false);
  EXPECT_EQ(a, b);  // same input -> identical bytes

  // Spot-check that key content is present and enums are kebab-case strings.
  EXPECT_NE(a.find("\"command-injection\""), std::string::npos);
  EXPECT_NE(a.find("\"severity\":\"critical\""), std::string::npos);
  EXPECT_NE(a.find("\"target\":\"main_agent\""), std::string::npos);
  EXPECT_NE(a.find("\"CWE-78\""), std::string::npos);
}
