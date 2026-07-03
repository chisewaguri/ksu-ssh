#include <sys/types.h>
#include <pwd.h>
#include <unistd.h>
#include <netdb.h>

#ifndef ANDROID_SPWD_GUARD
#define ANDROID_SPWD_GUARD
struct spwd {
    char *sp_namp;
    char *sp_pwdp;
    long sp_lstchg;
    long sp_min;
    long sp_max;
    long sp_warn;
    long sp_inact;
    long sp_expire;
    unsigned long sp_flag;
};
#endif

#ifndef ANDROID_TWEAKS_H
#define ANDROID_TWEAKS_H

struct passwd* getpwuida(uid_t uid);
struct passwd* getpwnama(const char *name);
struct spwd *getspnam(const char *name);
char *crypt(const char *, const char *);

const char* get_path_android(char root);

//char *sshelper_user;

#endif
