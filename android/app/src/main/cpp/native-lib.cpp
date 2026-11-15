#include <jni.h>
#include <string>
#include <vector>
#include <unistd.h>
#include <android/log.h>
#include <node.h>

#define LOG_TAG "KrDnD-Native"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

extern "C" JNIEXPORT jint JNICALL
Java_com_krdnd_server_NodeServerService_startNodeWithArguments(
        JNIEnv *env,
        jobject /* this */,
        jobjectArray arguments,
        jstring workingDir) {

    if (workingDir != nullptr) {
        const char *dir = env->GetStringUTFChars(workingDir, nullptr);
        if (dir != nullptr) {
            chdir(dir);
            LOGI("Changed working directory to: %s", dir);
            env->ReleaseStringUTFChars(workingDir, dir);
        }
    }

    int argc = env->GetArrayLength(arguments);
    std::vector<std::string> argStrings;
    std::vector<char *> argv;
    argStrings.reserve(argc);
    argv.reserve(argc + 1);

    for (int i = 0; i < argc; ++i) {
        auto str = (jstring) env->GetObjectArrayElement(arguments, i);
        const char *chars = env->GetStringUTFChars(str, nullptr);
        argStrings.emplace_back(chars != nullptr ? chars : "");
        env->ReleaseStringUTFChars(str, chars);
        argv.push_back(const_cast<char *>(argStrings.back().c_str()));
    }
    argv.push_back(nullptr);

    LOGI("Starting Node engine with %d arguments...", argc);
    int exitCode = node::Start(argc, argv.data());
    LOGI("Node engine stopped with exit code %d", exitCode);
    return exitCode;
}
