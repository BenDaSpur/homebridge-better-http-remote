<p align="center">

<img src="https://github.com/homebridge/branding/raw/latest/logos/homebridge-wordmark-logo-vertical.png" width="150">

</p>

<span align="center">

# ESPHome Buttons

</span>

Expose **ESPHome device buttons** as HomeKit switches. When you turn a switch "on" in the Home app, the plugin sends an HTTP POST to your ESPHome device’s web server to trigger that button (e.g. RF remote commands). No state is read back—each switch is a stateless trigger.

---

## ESPHome setup

1. Enable the **web server** on your ESPHome device (you already have `web_server:` in your YAML).
2. Give each button a stable **`id`** so the plugin can call it. The plugin calls `POST {baseUrl}/button/{id}/press`.

   In your ESPHome YAML, add an `id` to each template button, for example:

   ```yaml
   button:
     - platform: template
       name: 'Fan on/off'
       id: fan_on_off # use this id in Homebridge config
       on_press:
         - remote_transmitter.transmit_rc_switch_raw: ...
   ```

   If you don’t set `id`, ESPHome generates one from the name (e.g. `"Fan on/off"` → `fan-on-off`). You can find the generated id in the device’s web UI or by listing the buttons.

3. In Homebridge, add the **ESPHome Buttons** platform and list your devices and buttons (see example below).

---

## Homebridge config example

Based on your `mainbedroom.yaml`, you can configure the platform like this:

```json
{
  "platform": "BetterHttpRemote",
  "name": "HTTP Remote",
  "devices": [
    {
      "name": "Main Bedroom",
      "baseUrl": "http://mainbedroom.local",
      "buttons": [
        { "name": "Fan on/off", "id": "fan_on_off" },
        { "name": "Light on/off", "id": "light_on_off" },
        { "name": "Brighter lights", "id": "brighter_lights" },
        { "name": "Lower lights", "id": "lower_lights" },
        { "name": "Fan speed 1", "id": "fan_speed_1" },
        { "name": "Fan speed 2", "id": "fan_speed_2" },
        { "name": "Fan speed 3", "id": "fan_speed_3" }
      ]
    }
  ]
}
```

Use your device’s hostname (e.g. `mainbedroom.local`) or IP as `baseUrl`. Each entry in `buttons` becomes a switch in HomeKit; turning it on triggers that button on the device.

### Discover all ESPHome devices on the network (no baseUrl needed)

You can skip listing devices and baseUrls entirely. Set **`discoverDevicesOnNetwork`: true** and the plugin will find all ESPHome devices on your LAN via mDNS (they advertise `_esphomelib._tcp`), then discover buttons from each device:

```json
{
  "platform": "BetterHttpRemote",
  "name": "HTTP Remote",
  "discoverDevicesOnNetwork": true
}
```

Homebridge must run on the same network as the ESPHome devices. You can still add a **`devices`** array; discovered and manual devices are merged. Each discovered device uses **`discoverButtons: true`** so buttons are also auto-discovered.

### Auto-discover buttons (per device)

Set **`discoverButtons`: true** on a device and omit **`buttons`** to have the plugin discover all button entities from the device at startup (via its `/events` stream). The device must be reachable when Homebridge starts. Example:

```json
{
  "name": "Main Bedroom",
  "baseUrl": "http://mainbedroom.local",
  "discoverButtons": true
}
```

You can still set **`buttons`** manually for full control; discovery is for convenience when you want all buttons with default settings.

### Hold to repeat (brightness, fan speed, etc.)

For buttons you want to "hold" (e.g. brighter / dimmer, fan speed), the switch **stays on** while you hold it and sends repeated presses at an interval:

- **Platform:** `repeatIntervalMs` (default `250`) – how often (ms) to send a press while the switch is on. Set to `0` for single-press only.
- **Per button:** `repeatIntervalMs` – override (e.g. `0` for toggles, `200` for brightness).

Turn the switch **on** to start (one press + repeat); turn it **off** to stop. With `repeatIntervalMs: 0`, a quick tap sends one press and the switch resets to off.

---

## Testing on another server (remote Homebridge)

To run this plugin on a different machine than where you develop:

### 1. Build and pack on your dev machine

```bash
cd /path/to/homebridge-esphome-buttons
npm run build
npm pack
```

This creates a file like `homebridge-esphome-buttons-1.0.0.tgz`.

### 2. Copy the tarball to the server

Use `scp`, SFTP, or any copy method, e.g.:

```bash
scp homebridge-esphome-buttons-1.0.0.tgz user@your-homebridge-server:~/
```

### 3. Install the plugin on the server

SSH into the server, then install the plugin **globally** (so the global Homebridge can load it):

```bash
ssh user@your-homebridge-server
sudo npm install -g ./homebridge-esphome-buttons-1.0.0.tgz
```

If your Homebridge runs as a user (e.g. `hb-ui` or your own user) and uses a global Homebridge:

```bash
npm install -g ./homebridge-esphome-buttons-1.0.0.tgz
```

(Use the same user that runs Homebridge, and omit `sudo` if you use a user-level Node/npm.)

### 4. Add the platform to Homebridge config

On the server, edit the Homebridge config (often `~/.homebridge/config.json` or under `/var/lib/homebridge` if you use the service). Add a platform block like:

```json
{
  "platform": "BetterHttpRemote",
  "name": "HTTP Remote",
  "devices": [
    {
      "name": "Main Bedroom",
      "baseUrl": "http://mainbedroom.local",
      "buttons": [
        { "name": "Fan on/off", "id": "fan_on_off" },
        { "name": "Brighter lights", "id": "brighter_lights" }
      ]
    }
  ]
}
```

Use the server’s hostname or the ESPHome device’s IP if `mainbedroom.local` doesn’t resolve from the server (e.g. `http://192.168.1.20`).

### 5. Restart Homebridge

Restart the Homebridge process (service, Docker, or `homebridge -D`), then in the Home app the new switches should appear.

**Tip:** After code changes, run `npm run build` and `npm pack` again, copy the new `.tgz` to the server, and re-run the install command (same path); then restart Homebridge to pick up the new build.

---

## Publishing to npm (so others can install it)

To have your plugin installable like any other Homebridge plugin (from the Homebridge UI or `npm install -g homebridge-esphome-buttons`):

### 1. Before first publish

- **npm account:** Create one at [npmjs.com](https://www.npmjs.com/signup) if you don’t have it.
- **package.json:** Set **author** to your name or `"Your Name <you@example.com>"` (homepage/repository/bugs URLs are already set for this repo).
- **GitHub:** Ensure the repo is pushed to GitHub so the package links work.

### 2. Publish to npm

From the project root:

```bash
npm run lint          # must pass
npm run build         # builds dist/
npm login             # log in to npm (one-time or when session expires)
npm publish          # publishes; runs prepublishOnly (lint + build) first
```

- The first time you publish, the package name `homebridge-esphome-buttons` will be created on npm (it must be unused).
- After that, **only you** can publish new versions of this package (same npm user).

### 3. Installing the published plugin

Once published, anyone (including you) can install it like other plugins:

- **Homebridge UI:** Plugins → search for “ESPHome Buttons” or “homebridge-esphome-buttons” and install.
- **CLI:**
  ```bash
  npm install -g homebridge-esphome-buttons
  ```

Then add the **BetterHttpRemote** platform to the Homebridge config (see config example above) and restart Homebridge.

### 4. Releasing updates

Bump the version, then publish again:

```bash
npm version patch   # 1.0.0 → 1.0.1 (or minor/major)
npm publish
```

### 5. Automatic publish from GitHub (optional)

A **Publish to npm** workflow runs when code is pushed to the `latest` branch. It runs lint, build, then `npm publish`.

- **Repo secret:** In the repo settings, add a secret **`NPM_TOKEN`** with an [npm access token](https://www.npmjs.com/settings/~yourusername/tokens) (use “Automation” type for CI).
- **To release:** Bump the version in `package.json` (e.g. `npm version patch`), push to `latest`; the workflow will publish that version to npm. If the version was already published, the job will fail (reminder to bump again).

---

<span align="center">

# Homebridge Platform Plugin Template (development)

</span>

> [!IMPORTANT]
> **Homebridge v2.0 Information**
>
> This template currently has a
>
> - `package.json -> engines.homebridge` value of `"^1.8.0 || ^2.0.0-beta.0"`
> - `package.json -> devDependencies.homebridge` value of `"^2.0.0-beta.0"`
>
> This is to ensure that your plugin will build and run on both Homebridge v1 and v2.
>
> Once Homebridge v2.0 has been released, you can remove the `-beta.0` in both places.

---

This is a template Homebridge dynamic platform plugin and can be used as a base to help you get started developing your own plugin.

This template should be used in conjunction with the [developer documentation](https://developers.homebridge.io/). A full list of all supported service types, and their characteristics is available on this site.

### Clone As Template

Click the link below to create a new GitHub Repository using this template, or click the _Use This Template_ button above.

<span align="center">

### [Create New Repository From Template](https://github.com/homebridge/homebridge-plugin-template/generate)

</span>

### Setup Development Environment

To develop Homebridge plugins you must have Node.js 20 or later installed, and a modern code editor such as [VS Code](https://code.visualstudio.com/). This plugin template uses [TypeScript](https://www.typescriptlang.org/) to make development easier and comes with pre-configured settings for [VS Code](https://code.visualstudio.com/) and ESLint. If you are using VS Code install these extensions:

- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)

### Install Development Dependencies

Using a terminal, navigate to the project folder and run this command to install the development dependencies:

```shell
npm install
```

### Update package.json

Open the [`package.json`](./package.json) and change the following attributes:

- `name` - this should be prefixed with `homebridge-` or `@username/homebridge-`, is case-sensitive, and contains no spaces nor special characters apart from a dash `-`
- `displayName` - this is the "nice" name displayed in the Homebridge UI
- `homepage` - link to your GitHub repo's `README.md`
- `repository.url` - link to your GitHub repo
- `bugs.url` - link to your GitHub repo issues page

When you are ready to publish the plugin you should set `private` to false, or remove the attribute entirely.

### Update Plugin Defaults

Open the [`src/settings.ts`](./src/settings.ts) file and change the default values:

- `PLATFORM_NAME` - Set this to be the name of your platform. This is the name of the platform that users will use to register the plugin in the Homebridge `config.json`.
- `PLUGIN_NAME` - Set this to be the same name you set in the [`package.json`](./package.json) file.

Open the [`config.schema.json`](./config.schema.json) file and change the following attribute:

- `pluginAlias` - set this to match the `PLATFORM_NAME` you defined in the previous step.

See the [Homebridge API docs](https://developers.homebridge.io/#/config-schema#default-values) for more details on the other attributes you can set in the `config.schema.json` file.

### Build Plugin

TypeScript needs to be compiled into JavaScript before it can run. The following command will compile the contents of your [`src`](./src) directory and put the resulting code into the `dist` folder.

```shell
npm run build
```

### Link To Homebridge

Run this command so your global installation of Homebridge can discover the plugin in your development environment:

```shell
npm link
```

You can now start Homebridge, use the `-D` flag, so you can see debug log messages in your plugin:

```shell
homebridge -D
```

### Watch For Changes and Build Automatically

If you want to have your code compile automatically as you make changes, and restart Homebridge automatically between changes, you first need to add your plugin as a platform in `./test/hbConfig/config.json`:

```
{
...
    "platforms": [
        {
            "name": "Config",
            "port": 8581,
            "platform": "config"
        },
        {
            "name": "<PLUGIN_NAME>",
            //... any other options, as listed in config.schema.json ...
            "platform": "<PLATFORM_NAME>"
        }
    ]
}
```

and then you can run:

```shell
npm run watch
```

This will launch an instance of Homebridge in debug mode which will restart every time you make a change to the source code. It will load the config stored in the default location under `~/.homebridge`. You may need to stop other running instances of Homebridge while using this command to prevent conflicts. You can adjust the Homebridge startup command in the [`nodemon.json`](./nodemon.json) file.

### Customise Plugin

You can now start customising the plugin template to suit your requirements.

- [`src/platform.ts`](./src/platform.ts) - this is where your device setup and discovery should go.
- [`src/platformAccessory.ts`](./src/platformAccessory.ts) - this is where your accessory control logic should go, you can rename or create multiple instances of this file for each accessory type you need to implement as part of your platform plugin. You can refer to the [developer documentation](https://developers.homebridge.io/) to see what characteristics you need to implement for each service type.
- [`config.schema.json`](./config.schema.json) - update the config schema to match the config you expect from the user. See the [Plugin Config Schema Documentation](https://developers.homebridge.io/#/config-schema).

### Versioning Your Plugin

Given a version number `MAJOR`.`MINOR`.`PATCH`, such as `1.4.3`, increment the:

1. **MAJOR** version when you make breaking changes to your plugin,
2. **MINOR** version when you add functionality in a backwards compatible manner, and
3. **PATCH** version when you make backwards compatible bug fixes.

You can use the `npm version` command to help you with this:

```shell
# major update / breaking changes
npm version major

# minor update / new features
npm version update

# patch / bugfixes
npm version patch
```

### Publish Package

When you are ready to publish your plugin to [npm](https://www.npmjs.com/), make sure you have removed the `private` attribute from the [`package.json`](./package.json) file then run:

```shell
npm publish
```

If you are publishing a scoped plugin, i.e. `@username/homebridge-xxx` you will need to add `--access=public` to command the first time you publish.

#### Publishing Beta Versions

You can publish _beta_ versions of your plugin for other users to test before you release it to everyone.

```shell
# create a new pre-release version (eg. 2.1.0-beta.1)
npm version prepatch --preid beta

# publish to @beta
npm publish --tag beta
```

Users can then install the _beta_ version by appending `@beta` to the install command, for example:

```shell
sudo npm install -g homebridge-example-plugin@beta
```

### Best Practices

Consider creating your plugin with the [Homebridge Verified](https://github.com/homebridge/verified) criteria in mind. This will help you to create a plugin that is easy to use and works well with Homebridge.
You can then submit your plugin to the Homebridge Verified list for review.
The most up-to-date criteria can be found [here](https://github.com/homebridge/verified#requirements).
For reference, the current criteria are:

- **General**
  - The plugin must be of type [dynamic platform](https://developers.homebridge.io/#/#dynamic-platform-template).
  - The plugin must not offer the same nor less functionality than that of any existing **verified** plugin.
- **Repo**
  - The plugin must be published to NPM and the source code available on a GitHub repository, with issues enabled.
  - A GitHub release should be created for every new version of your plugin, with release notes.
- **Environment**
  - The plugin must run on all [supported LTS versions of Node.js](https://github.com/homebridge/homebridge/wiki/How-To-Update-Node.js), at the time of writing this is Node v18, v20 and v22.
  - The plugin must successfully install and not start unless it is configured.
  - The plugin must not execute post-install scripts that modify the users' system in any way.
  - The plugin must not require the user to run Homebridge in a TTY or with non-standard startup parameters, even for initial configuration.
- **Codebase**
  - The plugin must implement the [Homebridge Plugin Settings GUI](https://developers.homebridge.io/#/config-schema).
  - The plugin must not contain any analytics or calls that enable you to track the user.
  - If the plugin needs to write files to disk (cache, keys, etc.), it must store them inside the Homebridge storage directory.
  - The plugin must not throw unhandled exceptions, the plugin must catch and log its own errors.

### Useful Links

Note these links are here for help but are not supported/verified by the Homebridge team

- [Custom Characteristics](https://github.com/homebridge/homebridge-plugin-template/issues/20)
