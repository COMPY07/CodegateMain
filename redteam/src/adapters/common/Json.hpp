#pragma once
#include <nlohmann/json.hpp>

#include <cstdint>
#include <string>
#include <vector>

// Small, forgiving accessors over nlohmann::json. All getters return a default
// instead of throwing on a missing/mistyped key, so malformed upstream input
// degrades gracefully rather than aborting the run.
namespace redteam::js {

using nlohmann::json;

inline std::string get_str(const json& o, const char* k, std::string def = "") {
  if (!o.is_object()) return def;
  auto it = o.find(k);
  if (it != o.end() && it->is_string()) return it->get<std::string>();
  return def;
}

inline double get_num(const json& o, const char* k, double def = 0.0) {
  if (!o.is_object()) return def;
  auto it = o.find(k);
  if (it != o.end() && it->is_number()) return it->get<double>();
  return def;
}

inline int get_int(const json& o, const char* k, int def = 0) {
  if (!o.is_object()) return def;
  auto it = o.find(k);
  if (it == o.end() || !it->is_number()) return def;
  if (it->is_number_integer() || it->is_number_unsigned()) return it->get<int>();
  return static_cast<int>(it->get<double>());
}

inline std::uint64_t get_u64(const json& o, const char* k, std::uint64_t def) {
  if (!o.is_object()) return def;
  auto it = o.find(k);
  if (it == o.end() || !it->is_number()) return def;
  if (it->is_number_integer() || it->is_number_unsigned())
    return it->get<std::uint64_t>();
  double d = it->get<double>();
  return d < 0.0 ? def : static_cast<std::uint64_t>(d);
}

inline bool get_bool(const json& o, const char* k, bool def = false) {
  if (!o.is_object()) return def;
  auto it = o.find(k);
  if (it != o.end() && it->is_boolean()) return it->get<bool>();
  return def;
}

inline const json& get_obj(const json& o, const char* k) {
  static const json kEmpty = json::object();
  if (!o.is_object()) return kEmpty;
  auto it = o.find(k);
  if (it != o.end() && it->is_object()) return *it;
  return kEmpty;
}

inline std::vector<std::string> get_str_array(const json& o, const char* k) {
  std::vector<std::string> out;
  if (!o.is_object()) return out;
  auto it = o.find(k);
  if (it == o.end() || !it->is_array()) return out;
  for (const auto& e : *it) {
    if (e.is_string()) out.push_back(e.get<std::string>());
  }
  return out;
}

}  // namespace redteam::js
