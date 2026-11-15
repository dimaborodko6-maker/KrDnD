cmake_minimum_required(VERSION 3.18.1)
project("krdnd-native")

include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../../../libnode/include/node)

add_library(libnode SHARED IMPORTED)
set_target_properties(
    libnode
    PROPERTIES IMPORTED_LOCATION
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../libnode/bin/${ANDROID_ABI}/libnode.so
)

add_library(
    native-lib
    SHARED
    native-lib.cpp
)

find_library(log-lib log)

target_link_libraries(
    native-lib
    libnode
    ${log-lib}
)
