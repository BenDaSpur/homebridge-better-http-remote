# Changelog

All notable changes to this project will be documented in this file.

## [1.0.9] - 2026-02-28

- feat: add accessoryName option for single remote per device configuration (0eff359)

## [1.0.8] - 2026-02-23

- chore: update publish workflow to generate changelog and create GitHub release (23ff5f4)
- chore: release 1.0.7 [skip ci] (2965440)
- docs: improve documentation for singleRemotePerDevice option (272e629)
- feat: add single remote per device option and update documentation (da64cb9)
- chore: release 1.0.6 [skip ci] (58bcbad)
- feat: add control type option for buttons in config schema and update documentation (8df388e)
- chore: release 1.0.5 [skip ci] (0599be1)
- feat: add fire-and-forget option for HomeKit switches and update README (3672bf4)
- chore: release 1.0.4 [skip ci] (ef20f93)
- Enhance button discovery function to include logging capabilities and increase timeout values. Update platform integration to utilize the new logging feature for improved debugging. (1479fa7)
- chore: release 1.0.3 [skip ci] (f6dd842)
- Enhance ESPHome button discovery logic to support "button-..." IDs and improve REST URL matching with entity names. Update fetch request in RemoteButtonAccessory to include an empty body for POST requests. (adcff72)
- chore: release 1.0.2 [skip ci] (b9db253)
- Register platform under both PLATFORM_NAME and PLUGIN_NAME in Homebridge for improved compatibility. (204f249)
- chore: release 1.0.1 [skip ci] (2a2002a)
- Update default platform name to ESPHome Buttons in config schema and README. Modify accessory model name for consistency with new branding. (61fe0be)
- Rename plugin to ESPHome Buttons, update configuration schema to support device discovery, and enhance README with new features. Added multicast DNS for network discovery of ESPHome devices and auto-discovery of buttons from devices. (9a222d7)
- Update package.json, README, and add GitHub Actions workflow for npm publishing. Enhanced package metadata, added installation instructions, and automated publishing process for the Better HTTP Remote plugin. (376bda3)
- Update configuration and refactor code for Better HTTP Remote plugin. Changed Prettier settings for formatting consistency, improved ESLint configuration, and streamlined TypeScript imports and logic in platform and accessory files for better readability and maintainability. (9b40cbd)
- Refactor Homebridge plugin to Better HTTP Remote, adding support for ESPHome device buttons. Updated configuration schema, README, and example Homebridge config. Enhanced ESLint and TypeScript settings for improved code quality. (5c58799)
- Initial commit (6fa6b22)
