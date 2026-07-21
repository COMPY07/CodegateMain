cmake_minimum_required(VERSION 3.20)
project(sa_redteam LANGUAGES CXX)

# ---- options ----------------------------------------------------------------
option(RT_ENABLE_DIRECT_BACKEND "Build the libcurl-backed DirectApiBackend (real LLM calls)" ON)
option(RT_ENABLE_RE2            "Use RE2 instead of std::regex for hostile-input scanning"   OFF)
option(RT_BUILD_TESTS          "Build the GoogleTest suite"                                  ON)
option(RT_WARNINGS_AS_ERRORS   "Treat compiler warnings as errors"                          OFF)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
  set(CMAKE_BUILD_TYPE RelWithDebInfo CACHE STRING "" FORCE)
endif()

include(cmake/Dependencies.cmake)

# ---- warning flags ----------------------------------------------------------
add_library(rt_warnings INTERFACE)
if(MSVC)
  target_compile_options(rt_warnings INTERFACE /W4)
  if(RT_WARNINGS_AS_ERRORS)
    target_compile_options(rt_warnings INTERFACE /WX)
  endif()
else()
  target_compile_options(rt_warnings INTERFACE -Wall -Wextra -Wpedantic -Wshadow -Wconversion -Wsign-conversion)
  if(RT_WARNINGS_AS_ERRORS)
    target_compile_options(rt_warnings INTERFACE -Werror)
  endif()
endif()

# ---- source groups ----------------------------------------------------------
file(GLOB_RECURSE CORE_SOURCES    CONFIGURE_DEPENDS ${CMAKE_SOURCE_DIR}/src/domain/*.cpp
                                                    ${CMAKE_SOURCE_DIR}/src/app/*.cpp)
file(GLOB_RECURSE ADAPTER_SOURCES CONFIGURE_DEPENDS ${CMAKE_SOURCE_DIR}/src/adapters/*.cpp)

# This project lives on a non-APFS volume that sprays macOS AppleDouble sidecar
# files ("._Foo.cpp"); they are not valid source, so drop them from every glob.
list(FILTER CORE_SOURCES    EXCLUDE REGEX "/\\._")
list(FILTER ADAPTER_SOURCES EXCLUDE REGEX "/\\._")

# the CLI entry point is linked into the executable, not the adapter library
list(FILTER ADAPTER_SOURCES EXCLUDE REGEX "adapters/driving/cli/main\\.cpp$")

# DirectApiBackend + its HttpClient are the ONLY units that touch the network;
# strip them entirely unless explicitly enabled, so the default build links no curl.
if(NOT RT_ENABLE_DIRECT_BACKEND)
  list(FILTER ADAPTER_SOURCES EXCLUDE REGEX "DirectApiBackend")
  list(FILTER ADAPTER_SOURCES EXCLUDE REGEX "HttpClient")
endif()

# ---- redteam_core : pure deterministic domain (no json, no curl, no network) -
add_library(redteam_core STATIC ${CORE_SOURCES})
target_include_directories(redteam_core
  PUBLIC  ${CMAKE_SOURCE_DIR}/include
  PRIVATE ${CMAKE_SOURCE_DIR}/src)
target_link_libraries(redteam_core PRIVATE rt_warnings)

# ---- redteam_adapters : json / fs / llm-fake / cli-helpers ------------------
add_library(redteam_adapters STATIC ${ADAPTER_SOURCES})
target_include_directories(redteam_adapters
  PUBLIC ${CMAKE_SOURCE_DIR}/include
  PRIVATE ${CMAKE_SOURCE_DIR}/src)
target_link_libraries(redteam_adapters
  PUBLIC  redteam_core nlohmann_json::nlohmann_json
  PRIVATE rt_warnings)

if(RT_ENABLE_DIRECT_BACKEND)
  target_compile_definitions(redteam_adapters PUBLIC RT_HAVE_DIRECT_BACKEND=1)
  target_link_libraries(redteam_adapters PRIVATE CURL::libcurl)
endif()
if(RT_ENABLE_RE2)
  find_package(re2 REQUIRED)
  target_compile_definitions(redteam_core PUBLIC RT_HAVE_RE2=1)
  target_link_libraries(redteam_core PRIVATE re2::re2)
endif()

# ---- sa-redteam : CLI executable --------------------------------------------
add_executable(sa-redteam ${CMAKE_SOURCE_DIR}/src/adapters/driving/cli/main.cpp)
target_include_directories(sa-redteam PRIVATE ${CMAKE_SOURCE_DIR}/src)
target_link_libraries(sa-redteam PRIVATE redteam_adapters redteam_core rt_warnings)

# ---- tests ------------------------------------------------------------------
if(RT_BUILD_TESTS)
  enable_testing()
  file(GLOB_RECURSE TEST_SOURCES CONFIGURE_DEPENDS ${CMAKE_SOURCE_DIR}/tests/unit/*.cpp)
  list(FILTER TEST_SOURCES EXCLUDE REGEX "/\\._")
  add_executable(redteam_tests ${TEST_SOURCES})
  target_include_directories(redteam_tests PRIVATE ${CMAKE_SOURCE_DIR}/src ${CMAKE_SOURCE_DIR}/tests)
  target_link_libraries(redteam_tests PRIVATE redteam_adapters redteam_core GTest::gtest_main)
  target_compile_definitions(redteam_tests PRIVATE
    RT_FIXTURES_DIR="${CMAKE_SOURCE_DIR}/tests/fixtures")
  include(GoogleTest)
  gtest_discover_tests(redteam_tests)
endif()
