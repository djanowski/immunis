TEST_FILES := $(shell find test -name '*_test.js')

test:
	./node_modules/.bin/tape test/config $(TEST_FILES)

.PHONY: test
