$(eval $(call start_package))
OPENSSL?=openssl-3.6.1

PACKAGE:=openssl

ARCHIVE_NAME:=$(OPENSSL).tar.gz
DOWNLOAD_URL:=https://www.openssl.org/source/$(ARCHIVE_NAME)
LIBCRYPTO_VERSION:=3

PACKAGE_INSTALLED_FILES:=$(BUILD_DIR)/usr/lib/libcrypto.so \
                          $(BUILD_DIR)/usr/lib/libssl.so    \
                          $(BUILD_DIR)/usr/bin/openssl

define pkg-targets
$(BUILD_DIR)/$(PACKAGE)/stamp.configured: $(SRC_DIR)/$(PACKAGE)/stamp.prepared
	mkdir -p $(BUILD_DIR)/$(PACKAGE)
	cp -R "$(SRC_DIR)/$(PACKAGE)/$(OPENSSL)/." "$(BUILD_DIR)/$(PACKAGE)"
	cd "$(BUILD_DIR)/$(PACKAGE)";                         \
		PATH=$(EXTRA_PATH):$(PATH)                    \
		ANDROID_NDK_ROOT=$(ANDROID_ROOT)              \
		./Configure "$(OPENSSL_ARCH)"                 \
			shared                                \
			-U__ANDROID_API__                     \
			-D__ANDROID_API__=$(ANDROID_PLATFORM)
	$(make-configured-stamp)

$(BUILD_DIR)/usr/lib/libcrypto.so: $(BUILD_DIR)/$(PACKAGE)/stamp.built
	mkdir -p $(BUILD_DIR)/usr/lib/
	cp -u "$(BUILD_DIR)/$(PACKAGE)/libcrypto.so" "$(BUILD_DIR)/usr/lib/"
	$(STRIP) "$(BUILD_DIR)/usr/lib/libcrypto.so"

$(BUILD_DIR)/usr/lib/libssl.so: $(BUILD_DIR)/$(PACKAGE)/stamp.built
	mkdir -p $(BUILD_DIR)/usr/lib/
	cp -u "$(BUILD_DIR)/$(PACKAGE)/libssl.so" "$(BUILD_DIR)/usr/lib/"
	$(STRIP) "$(BUILD_DIR)/usr/lib/libssl.so"

$(BUILD_DIR)/usr/bin/openssl: $(BUILD_DIR)/$(PACKAGE)/stamp.built
	mkdir -p $(BUILD_DIR)/usr/bin/
	cp -u "$(BUILD_DIR)/$(PACKAGE)/apps/openssl" "$(BUILD_DIR)/usr/bin/"
	$(STRIP) "$(BUILD_DIR)/usr/bin/openssl"
endef

$(eval $(package))
