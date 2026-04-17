$(eval $(call start_package)) # not really a package, but we may reset stuff just in case

MAGISK_INSTALLER_VERSION?=v24.1

.PHONY: module
module: $(BUILD_DIR)/ksu_ssh-$(VERSION).zip

$(BUILD_DIR)/module/stamp.module-created:
	mkdir -p $(BUILD_DIR)/module/ksu_ssh
	mkdir -p $(BUILD_DIR)/module/ksu_ssh/arch
	mkdir -p $(BUILD_DIR)/module/ksu_ssh/common
	touch $(BUILD_DIR)/module/stamp.module-created

$(BUILD_DIR)/module/stamp.module-staticdata: $(BUILD_DIR)/module/stamp.module-created
	cp -R $(ROOT_DIR)/module_data/. $(BUILD_DIR)/module/ksu_ssh/
	touch $(BUILD_DIR)/module/stamp.module-staticdata

$(BUILD_DIR)/module/stamp.module-binaries: $(BUILD_DIR)/module/stamp.module-created \
                                           $(INSTALLED_FILES_arm)                   \
                                           $(INSTALLED_FILES_arm64)                 \
                                           $(INSTALLED_FILES_x86)                   \
                                           $(INSTALLED_FILES_x86_64)
	cp -r $(BUILD_DIR)/arm/usr    $(BUILD_DIR)/module/ksu_ssh/arch/arm
	cp -r $(BUILD_DIR)/arm64/usr  $(BUILD_DIR)/module/ksu_ssh/arch/arm64
	cp -r $(BUILD_DIR)/x86/usr    $(BUILD_DIR)/module/ksu_ssh/arch/x86
	cp -r $(BUILD_DIR)/x86_64/usr $(BUILD_DIR)/module/ksu_ssh/arch/x86_64
	touch $(BUILD_DIR)/module/stamp.module-binaries

$(BUILD_DIR)/module/stamp.module-initscript: $(BUILD_DIR)/arm/openssh/stamp.built     \
                                             $(BUILD_DIR)/module/stamp.module-created
	sed -e 's:#!/bin/sh:#!/system/bin/sh:'         \
	    -e 's#=/bin#=/system/bin#'                 \
	    -e 's#.*PidFile.*##'                       \
	    -e 's#sbin#bin#'                           \
	    -e 's#^prefix=.*#prefix=/system#' \
	    -e 's#@COMMENT_OUT_RSA1@.*##'              \
	    $(BUILD_DIR)/arm/openssh/opensshd.init     \
	    > $(BUILD_DIR)/module/ksu_ssh/common/opensshd.init
	touch $(BUILD_DIR)/module/stamp.module-initscript

$(BUILD_DIR)/module/stamp.module: $(BUILD_DIR)/module/stamp.module-staticdata \
                                  $(BUILD_DIR)/module/stamp.module-binaries   \
                                  $(BUILD_DIR)/module/stamp.module-initscript
	touch $(BUILD_DIR)/module/stamp.module

$(ARCHIVE_DIR)/magisk_installer-$(MAGISK_INSTALLER_VERSION).sh: $(ARCHIVE_DIR)/stamp.created
	wget -O "$(ARCHIVE_DIR)/magisk_installer-$(MAGISK_INSTALLER_VERSION).sh" \
	     --no-use-server-timestamps                                          \
	     "https://raw.githubusercontent.com/topjohnwu/Magisk/$(MAGISK_INSTALLER_VERSION)/scripts/module_installer.sh"
	cd "$(ARCHIVE_DIR)";                                                                         \
	sha512sum -c $(ROOT_DIR)/checksums/magisk_installer-$(MAGISK_INSTALLER_VERSION).sh.sha512 || \
	(mv "$(ARCHIVE_DIR)/magisk_installer-$(MAGISK_INSTALLER_VERSION).sh"                         \
	    "$(ARCHIVE_DIR)/magisk_installer-$(MAGISK_INSTALLER_VERSION).sh.invalid_checksum";       \
	 false)

$(BUILD_DIR)/module/stamp.module-standalone: $(BUILD_DIR)/module/stamp.module \
                                             $(ARCHIVE_DIR)/magisk_installer-$(MAGISK_INSTALLER_VERSION).sh
	cp -r $(BUILD_DIR)/module/ksu_ssh/. $(BUILD_DIR)/module/ksu_ssh_standalone
	cp "$(ARCHIVE_DIR)/magisk_installer-$(MAGISK_INSTALLER_VERSION).sh" \
	   "$(BUILD_DIR)/module/ksu_ssh_standalone/META-INF/com/google/android/update-binary"
	touch $(BUILD_DIR)/module/stamp.module-standalone

$(BUILD_DIR)/ksu_ssh_$(VERSION).zip: $(BUILD_DIR)/module/stamp.module-standalone
	rm -f $(BUILD_DIR)/ksu_ssh_$(VERSION).zip
	if which 7z > /dev/null; then                                                    \
		cd $(BUILD_DIR)/module/ksu_ssh_standalone;                            \
		7z a -mx9 $(shell realpath $(BUILD_DIR)/ksu_ssh_$(VERSION).zip) -- *; \
	else                                                                             \
		cd $(BUILD_DIR)/module/ksu_ssh_standalone;                            \
		zip -9 -r $(shell realpath $(BUILD_DIR)/ksu_ssh_$(VERSION).zip) *;    \
	fi

.PHONY: zip
zip: $(BUILD_DIR)/ksu_ssh_$(VERSION).zip
