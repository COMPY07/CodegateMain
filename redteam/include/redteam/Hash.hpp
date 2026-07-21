#pragma once
#include <cstdint>
#include <string>
#include <string_view>

// Deterministic non-cryptographic hashing (FNV-1a). Used for stable run ids and
// config hashes so golden reports are byte-reproducible without Date/random.
namespace redteam {

inline std::uint64_t fnv1a64(std::string_view s) noexcept {
  std::uint64_t h = 1469598103934665603ULL;
  for (char ch : s) {
    h ^= static_cast<unsigned char>(ch);
    h *= 1099511628211ULL;
  }
  return h;
}

inline std::string fnv1a_hex(std::string_view s) {
  std::uint64_t h = fnv1a64(s);
  static constexpr char kDigits[] = "0123456789abcdef";
  std::string out(16, '0');
  for (int i = 15; i >= 0; --i) {
    out[static_cast<std::size_t>(i)] = kDigits[h & 0xFu];
    h >>= 4;
  }
  return out;
}

}  // namespace redteam
