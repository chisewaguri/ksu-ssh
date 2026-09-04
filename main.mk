ROOT_DIR:=$(shell dirname $(realpath $(lastword $(MAKEFILE_LIST))))
include $(ROOT_DIR)/helpers.mk

#Configurables
BUILD_DIR?=.
ARCHIVE_DIR?=$(ROOT_DIR)/dl/
SRC_DIR?=$(ROOT_DIR)/src/
ANDROID_ROOT?=/opt/android-ndk
ANDROID_PLATFORM?=24
ANDROID_ARCH?=arm64
TRIPLET_ARCH?=aarch64
ANDROID_MARCH?=armv8-a
CFLAGS=-O3 -pipe -fomit-frame-pointer -fPIE
LDFLAGS=-pie
CROSS?=$(ANDROID_MARCH)-linux-android
CC=$(CROSS)$(ANDROID_PLATFORM)-clang
LD=ld
AS=llvm-as
AR=llvm-ar
OPENSSL_ARCH=android-$(ANDROID_ARCH)
EXTRA_PATH := $(ANDROID_ROOT)/toolchains/llvm/prebuilt/linux-x86_64/bin/
STRIP=$(EXTRA_PATH)/llvm-strip

BUILD_DIR:=$(shell realpath $(BUILD_DIR))
ARCHIVE_DIR:=$(shell realpath $(ARCHIVE_DIR))
SRC_DIR:=$(shell realpath $(SRC_DIR))
$(eval $(call save_flags))

define arch-targets
.PHONY: copy$(PHONY_TARGET_PREFIX)
copy$(PHONY_TARGET_PREFIX): copy$(PHONY_TARGET_PREFIX)_openssl copy$(PHONY_TARGET_PREFIX)_openssh copy$(PHONY_TARGET_PREFIX)_rsync

.PHONY: all$(PHONY_TARGET_PREFIX)
all$(PHONY_TARGET_PREFIX): build$(PHONY_TARGET_PREFIX)_openssl build$(PHONY_TARGET_PREFIX)_openssh build$(PHONY_TARGET_PREFIX)_rsync

INSTALLED_FILES$(PHONY_TARGET_PREFIX):=$(openssl_INSTALLED_FILES) $(openssh_INSTALLED_FILES) $(rsync_INSTALLED_FILES) $(BUILD_DIR)/usr/bin/sshd-private-devpts
$(BUILD_DIR)/usr/bin/sshd-private-devpts: $(ROOT_DIR)/native/sshd-private-devpts.c
	mkdir -p "$(BUILD_DIR)/usr/bin"
	$(CC) $(CFLAGS) $(LDFLAGS) -Wall -Wextra -Werror -o "$$@" "$$<"
endef


$(eval $(call submk,global_targets.mk))
$(eval $(call submk,openssl.mk))
$(eval $(call submk,openssh.mk))
$(eval $(call submk,rsync.mk))

$(eval $(arch-targets))
