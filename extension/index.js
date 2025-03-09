var vscode = require('vscode');
var fs = require('mz/fs');
var fsExtra = require('fs-extra');
var path = require('path');
var { pathToFileURL } = require('url')

/**
 * @type {(info: string) => string}
 */
const localize = require('./i18n');

/**
 * @type {'unknown' | 'win10' | 'macos'}
 */
const os = require('./platform');

var themeStylePaths = {
  'Default Dark': '../themes/Default Dark.css',
  'Dark (Exclude Tab Line)': '../themes/Dark (Exclude Tab Line).css',
  'Dark (Only Subbar)': '../themes/Dark (Only Subbar).css',
  'Default Light': '../themes/Default Light.css',
  'Light (Only Subbar)': '../themes/Light (Only Subbar).css',
  'Tokyo Night Storm': '../themes/Tokyo Night Storm.css',
  'Tokyo Night Storm (Outer)': '../themes/Tokyo Night Storm (Outer).css',
  'Noir et blanc': '../themes/Noir et blanc.css',
  'Solarized Dark+': '../themes/Solarized Dark+.css',
  'Catppuccin Mocha': '../themes/Catppuccin Mocha.css',
  'GitHub Dark Default': '../themes/GitHub Dark Default.css',
  'Custom theme (use imports)': '../themes/Custom Theme.css',
}

const themeConfigPaths = {
  'Default Dark': '../themes/Default Dark.json',
  'Dark (Exclude Tab Line)': '../themes/Dark (Exclude Tab Line).json',
  'Dark (Only Subbar)': '../themes/Dark (Only Subbar).json',
  'Default Light': '../themes/Default Light.json',
  'Light (Only Subbar)': '../themes/Light (Only Subbar).json',
  'Tokyo Night Storm': '../themes/Tokyo Night Storm.json',
  'Tokyo Night Storm (Outer)': '../themes/Tokyo Night Storm (Outer).json',
  'Noir et blanc': '../themes/Noir et blanc.json',
  'Solarized Dark+': '../themes/Solarized Dark+.json',
  'Catppuccin Mocha': '../themes/Catppuccin Mocha.json',
  'GitHub Dark Default': '../themes/GitHub Dark Default.json',
  'Custom theme (use imports)': '../themes/Custom Theme.json',
}

var defaultTheme = 'Default Dark';

function getCurrentTheme(config) {
  return config.theme in themeStylePaths ? config.theme : defaultTheme;
}

function checkDarkLightMode(theme) {
  const enableAutoTheme = vscode.workspace.getConfiguration().get("vscode_vibrancy.enableAutoTheme");
  if (!enableAutoTheme) return;

  const currentTheme = theme.kind;

  const currentColorTheme = vscode.workspace.getConfiguration().get("vscode_vibrancy.theme");
  const preferredDarkColorTheme = vscode.workspace.getConfiguration().get("vscode_vibrancy.preferredDarkTheme");
  const preferredLightColorTheme = vscode.workspace.getConfiguration().get("vscode_vibrancy.preferredLightTheme");

  let targetVibrancyTheme;
  if (currentTheme === vscode.ColorThemeKind.Dark) {
    targetVibrancyTheme = preferredDarkColorTheme;
  } else if (currentTheme === vscode.ColorThemeKind.Light) {
    targetVibrancyTheme = preferredLightColorTheme;}
  else {
    return;
  }

  if (currentColorTheme !== targetVibrancyTheme) {
    vscode.workspace.getConfiguration("vscode_vibrancy").update("theme", targetVibrancyTheme, vscode.ConfigurationTarget.Global);
  }
}

async function promptRestart() {
  // Store the current value of "window.titleBarStyle"
  const titleBarStyle = vscode.workspace.getConfiguration().get("window.titleBarStyle");

  // Toggle the value of "window.titleBarStyle" to prompt for a restart
  await vscode.workspace.getConfiguration().update("window.titleBarStyle", titleBarStyle === "native" ? "custom" : "native", vscode.ConfigurationTarget.Global);

  // Reset the value of "window.titleBarStyle" to its original value
  await vscode.workspace.getConfiguration().update("window.titleBarStyle", titleBarStyle, vscode.ConfigurationTarget.Global);
}

async function checkColorTheme() {
  // Get the current color theme and target theme from configuration files
  const currentTheme = getCurrentTheme(vscode.workspace.getConfiguration("vscode_vibrancy"));

  // if theme is "Custom theme (use imports)", skip the check
  if (currentTheme === 'Custom theme (use imports)') {
    return;
  }

  const themeConfig = require(path.join(__dirname, themeConfigPaths[currentTheme]));
  const targetTheme = themeConfig.colorTheme;
  const currentColorTheme = vscode.workspace.getConfiguration().get("workbench.colorTheme");

  // Show a message to the user if the current color theme doesn't match the target theme
  if (targetTheme !== currentColorTheme) {
    const message = localize('messages.recommendedColorTheme')
      .replace('%1', currentColorTheme)
      .replace('%2', targetTheme);

    const result = await vscode.window.showInformationMessage(message, localize('messages.changeColorThemeIde'), localize('messages.noIde'));

    // If the user chooses to change the color theme, update the configuration
    if (result === localize('messages.changeColorThemeIde')) {
      await vscode.workspace.getConfiguration().update("workbench.colorTheme", targetTheme, vscode.ConfigurationTarget.Global);
    }
  }
}

// Electron 26 changed the available vibrancy types, this ensures that upgrading users switch
async function checkElectronDeprecatedType() {
  let electronVersion = process.versions.electron;
  let majorVersion = parseInt(electronVersion.split('.')[0]);

  if (majorVersion > 25) {
    const currentType = vscode.workspace.getConfiguration("vscode_vibrancy").type;
    const deprecatedTypes = [
      "appearance-based",
      "dark",
      "ultra-dark",
      "light",
      "medium-light"
    ];
  
    if (deprecatedTypes.includes(currentType)) {
      vscode.window.showWarningMessage(
        localize('messages.electronDeprecatedType').replace('%1', currentType),
        { title: "Default" },
        { title: "Transparent" }
      ).then(async (msg) => {
        if (msg) {
          const newType = msg.title === "Default" ? "under-window" : "fullscreen-ui";
          await vscode.workspace
            .getConfiguration("vscode_vibrancy")
            .update("type", newType, vscode.ConfigurationTarget.Global);
        }
      });
    }
  }
}

function deepEqual(obj1, obj2) {
  if (obj1 === obj2) {
    // Objects are the same
    return true;
  }

  if (isPrimitive(obj1) && isPrimitive(obj2)) {
    // Compare primitive values
    return obj1 === obj2;
  }

  if (Object.keys(obj1).length !== Object.keys(obj2).length) {
    // Objects have different number of properties
    return false;
  }

  // Compare objects with the same number of properties
  for (const key in obj1) {
    if (!(key in obj2)) {
      // Other object doesn't have this property
      return false;
    }

    if (!deepEqual(obj1[key], obj2[key])) {
      // Properties are not equal
      return false;
    }
  }

  // Objects are equal
  return true;
}

//check if value is primitive
function isPrimitive(obj) {
  return (obj !== Object(obj));
}

// Check if runtime and asset updates are necessary based on version numbers
function checkRuntimeUpdate(current, last) {
  // Split the versions into major and minor numbers
  const [currentMajor, currentMinor] = current.split('.').slice(0, 2);
  const [lastMajor, lastMinor] = last.split('.').slice(0, 2);

  // Convert the numbers to integers and compare them
  return (parseInt(currentMajor) !== parseInt(lastMajor)) || (parseInt(currentMinor) !== parseInt(lastMinor));
}

function activate(context) {
  console.log('vscode-vibrancy is active!');

  var appDir;
  try {
    appDir = path.dirname(require.main.filename);
  } catch {
    appDir = _VSCODE_FILE_ROOT;
  }
  let useEsmRuntime = false;
  var JSFile = path.join(appDir, '/main.js');
  var ElectronJSFile = path.join(appDir, '/vs/code/electron-main/main.js');

  // VSC 1.95 merges these main.js files
  if (!fs.existsSync(ElectronJSFile)) {
    ElectronJSFile = JSFile;
  }
  
  var runtimeVersion = 'v6';
  var runtimeDir = path.join(appDir, '/vscode-vibrancy-runtime-' + runtimeVersion);
  var runtimeSrcDir = "../runtime-pre-esm"
  
  // VSC 1.94 used ESM, 1.95 dropped it
  const workbenchHtmlPath = path.join(appDir, 'vs/code/electron-sandbox/workbench/workbench.html');
  const workbenchEsmHtmlPath = path.join(appDir, 'vs/code/electron-sandbox/workbench/workbench.esm.html');
  var HTMLFile;
  if (fs.existsSync(workbenchHtmlPath)) {
      HTMLFile = workbenchHtmlPath;
  } else {
      HTMLFile = workbenchEsmHtmlPath;
      useEsmRuntime = true;
      runtimeSrcDir = "../runtime"
  }

  async function installRuntime() {
    // if runtimeDir exists, recurse through it and delete all files
    if (fs.existsSync(runtimeDir)) {
      fs.rmSync(runtimeDir, { recursive: true, force: true });
    }

    await fs.mkdir(runtimeDir);
    await fsExtra.copy(path.resolve(__dirname, runtimeSrcDir), path.resolve(runtimeDir));
  }

  async function installRuntimeWin() {
    // if runtimeDir exists, recurse through it and delete all files
    // BUG: skip all .node files as they're locked by the VSCode process (#58)
    if (fs.existsSync(runtimeDir)) {
      fs.readdirSync(runtimeDir).forEach((file, index) => {
        if (file.endsWith('.node')) {
          return;
        }

        const curPath = path.join(runtimeDir, file);

        // if file is a directory, recurse through it and delete all files
        if (fs.lstatSync(curPath).isDirectory()) {
          fs.rmSync(curPath, { recursive: true, force: true });
          return;
        }

        fs.unlinkSync(curPath);
      });

      // copy all files from runtime to runtimeDir, skipping .node files
      fs.readdirSync(path.resolve(__dirname, runtimeSrcDir)).forEach((file, index) => {
        if (file.endsWith('.node')) {
          return;
        }

        // if file is a directory
        if (fs.lstatSync(path.join(path.resolve(__dirname, runtimeSrcDir), file)).isDirectory()) {
          fsExtra.copySync(path.join(path.resolve(__dirname, runtimeSrcDir), file), path.join(runtimeDir, file));
          return;
        }

        const curPath = path.join(path.resolve(__dirname, runtimeSrcDir), file);
        fs.copyFileSync(curPath, path.join(runtimeDir, file));
      });
    } else {
      await fs.mkdir(runtimeDir).catch(() => { });
      await fsExtra.copy(path.resolve(__dirname, runtimeSrcDir), path.resolve(runtimeDir));
    }
  }

  async function installJS() {
    const config = vscode.workspace.getConfiguration("vscode_vibrancy");
    const currentTheme = getCurrentTheme(config);
    const themeConfigPath = path.resolve(__dirname, themeConfigPaths[currentTheme]);
    const themeConfig = require(themeConfigPath);
    const themeStylePath = path.join(__dirname, themeStylePaths[currentTheme]);
    const themeCSS = await fs.readFile(themeStylePath, 'utf-8');
    const JS = await fs.readFile(JSFile, 'utf-8');
  
    const imports = await generateImports(config);
  
    const injectData = {
      os: os,
      config: config,
      theme: themeConfig,
      themeCSS: themeCSS,
      imports: imports,
    };
  
    const base = __filename;
    const newJS = generateNewJS(JS, base, injectData);
  
    await fs.writeFile(JSFile, newJS, 'utf-8');
    await modifyElectronJSFile(ElectronJSFile);
  }
  
  async function generateImports(config) {
    const imports = {
      css: "",
      js: "",
    };
  
    for (let i = 0; i < config.imports.length; i++) {
      if (config.imports[i] === "/path/to/file") continue;
  
      try {
        const importContent = await fs.readFile(config.imports[i], 'utf-8');
  
        if (config.imports[i].endsWith('.css')) {
          imports.css += `<style>${importContent}</style>`;
        } else {
          imports.js += `<script>${importContent}</script>`;
        }
      } catch (err) {
          vscode.window.showWarningMessage(localize('messages.importError').replace('%1', config.imports[i]));
        }
    }
  
    return imports;
  }
  
  function generateNewJS(JS, base, injectData) {
    let runtimePath;
    if (useEsmRuntime) {
      runtimePath = path.join(runtimeDir, "index.mjs")
    } else {
      runtimePath = path.join(runtimeDir, "index.cjs")
    }

    const newJS = JS.replace(/\n\/\* !! VSCODE-VIBRANCY-START !! \*\/[\s\S]*?\/\* !! VSCODE-VIBRANCY-END !! \*\//, '')
      + '\n/* !! VSCODE-VIBRANCY-START !! */\n;(function(){\n'
      + `if (!import('fs').then(fs => fs.existsSync(${JSON.stringify(base)}))) return;\n`
      + `global.vscode_vibrancy_plugin = ${JSON.stringify(injectData)}; try{ import("${pathToFileURL(runtimePath)}"); } catch (err) {console.error(err)}\n`
      + '})()\n/* !! VSCODE-VIBRANCY-END !! */';
  
    return newJS;
  }
  
  // BrowserWindow option modification
  async function modifyElectronJSFile(ElectronJSFile) {
    let ElectronJS = await fs.readFile(ElectronJSFile, 'utf-8');
  
    // add visualEffectState option to enable vibrancy while VSCode is not in focus (macOS only)
    if (!ElectronJS.includes('visualEffectState')) {
      ElectronJS = ElectronJS.replace(/experimentalDarkMode/g, 'visualEffectState:"active",experimentalDarkMode');
    }

    // enable frameless window on Windows w/ Electron 27 (bug #122)
    const electronMajorVersion = parseInt(process.versions.electron.split('.')[0]);
    if (!ElectronJS.includes('frame:false,') && process.platform === 'win32' && electronMajorVersion >= 27) {
      ElectronJS = ElectronJS.replace(/experimentalDarkMode/g, 'frame:false,transparent:true,experimentalDarkMode');
    }
  
    await fs.writeFile(ElectronJSFile, ElectronJS, 'utf-8');
  }
  
  async function installHTML() {
    const HTML = await fs.readFile(HTMLFile, 'utf-8');

    const metaTagRegex = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([\s\S]+?)">/;
    const trustedTypesRegex = /(trusted-types)(\r\n|\r|\n)/;
  
    const metaTagMatch = HTML.match(metaTagRegex);
  
    if (metaTagMatch) {
      const currentContent = metaTagMatch[0];

      const newContent = currentContent.replace(trustedTypesRegex, "$1 VscodeVibrancy\n");
  
      newHTML = HTML.replace(metaTagRegex, newContent);
    }

    try {
      if (HTML !== newHTML) {
        await fs.writeFile(HTMLFile, newHTML, 'utf-8');
      }
    } catch (ReferenceError) {
      throw localize('messages.htmlError');
    }
  }

  async function uninstallJS() {
    const JS = await fs.readFile(JSFile, 'utf-8');
    const needClean = /\n\/\* !! VSCODE-VIBRANCY-START !! \*\/[\s\S]*?\/\* !! VSCODE-VIBRANCY-END !! \*\//.test(JS);
    if (needClean) {
      const newJS = JS
        .replace(/\n\/\* !! VSCODE-VIBRANCY-START !! \*\/[\s\S]*?\/\* !! VSCODE-VIBRANCY-END !! \*\//, '')
      await fs.writeFile(JSFile, newJS, 'utf-8');
    }
    // remove visualEffectState option
    const ElectronJS = await fs.readFile(ElectronJSFile, 'utf-8');
    const newElectronJS = ElectronJS
      .replace(/frame:false,transparent:true,experimentalDarkMode/g, 'experimentalDarkMode')
      .replace(/visualEffectState:"active",experimentalDarkMode/g, 'experimentalDarkMode');
    await fs.writeFile(ElectronJSFile, newElectronJS, 'utf-8');
  }

  async function uninstallHTML() {
    const HTML = await fs.readFile(HTMLFile, 'utf-8');
    const needClean = /trusted-types VscodeVibrancy/.test(HTML);
    if (needClean) {
      const newHTML = HTML.replace(/trusted-types VscodeVibrancy(\r\n|\r|\n)/, "trusted-types$1");
      await fs.writeFile(HTMLFile, newHTML, 'utf-8');
    }
  }

  function enabledRestart() {
    vscode.window.showInformationMessage(localize('messages.enabled'), { title: localize('messages.restartIde') })
      .then(function (msg) {
        msg && promptRestart();
      });
  }

  function disabledRestart() {
    vscode.window.showInformationMessage(localize('messages.disabled'), { title: localize('messages.restartIde') })
      .then(function (msg) {
        msg && promptRestart();
      });
  }

  function isVSCodeThisVersionOrNewer(requiredVersion) {
    const currentVersion = vscode.version; // e.g., "1.96.0"

    // Extract only the numeric parts of the version string (e.g., "1.95.0-insider" -> "1.95.0")
    const currentVersionCleaned = currentVersion.match(/^\d+\.\d+\.\d+/)[0];

    // Split the version strings into major, minor, and patch numbers
    const currentParts = currentVersionCleaned.split('.').map(Number);
    const requiredParts = requiredVersion.split('.').map(Number);

    // Compare each part of the version
    for (let i = 0; i < requiredParts.length; i++) {
        if ((currentParts[i] || 0) > requiredParts[i]) {
            return true;
        } else if ((currentParts[i] || 0) < requiredParts[i]) {
            return false;
        }
    }

    // If all parts are equal, return true
    return true;
  }

  // Fix rendering of terminal by modifying VSCode settings
  async function changeTerminalSettings() {
    // Get the current settings
    const terminalColorConfig = vscode.workspace.getConfiguration().inspect("workbench.colorCustomizations");
    const gpuAccelerationConfig = vscode.workspace.getConfiguration().inspect("terminal.integrated.gpuAcceleration");
    const applyToAllProfilesConfig = vscode.workspace.getConfiguration().inspect("workbench.settings.applyToAllProfiles");

    // Fetch previous values from global state
    let previousCustomizations = context.globalState.get('customizations') || {};

    // Store original values if not already saved
    if (!previousCustomizations.saved) {
      previousCustomizations = {
        saved: true,
        terminalBackground: terminalColorConfig?.globalValue?.["terminal.background"], // Save only the specific key
        gpuAcceleration: gpuAccelerationConfig?.globalValue || "auto",
        removedFromApplyToAllProfiles: previousCustomizations.removedFromApplyToAllProfiles || false
      };
    }

    // Get current values
    const currentColorCustomizations = terminalColorConfig?.globalValue || {};
    const currentBackground = currentColorCustomizations["terminal.background"];
    const currentGpuAcceleration = gpuAccelerationConfig?.globalValue || "auto";
    const currentApplyToAllProfiles = applyToAllProfilesConfig?.globalValue || [];

    // Remove "workbench.colorCustomizations" from applyToAllProfiles if it's there to fix an issue this caused with profiles
    if (!previousCustomizations.removedFromApplyToAllProfiles && currentApplyToAllProfiles.includes("workbench.colorCustomizations")) {
      const updatedApplyToAllProfiles = currentApplyToAllProfiles.filter(setting => setting !== "workbench.colorCustomizations");
      await vscode.workspace.getConfiguration().update("workbench.settings.applyToAllProfiles", updatedApplyToAllProfiles, vscode.ConfigurationTarget.Global);

      // Notify user of the change
      vscode.window.showInformationMessage(localize('messages.applyToAllProfiles'));

    }
    // Ensure this fix is only applied once
    previousCustomizations.removedFromApplyToAllProfiles = true;

    // Update settings if necessary
    if (currentBackground !== "#00000000" || currentGpuAcceleration !== "off") {
      const newColorCustomization = {
        ...currentColorCustomizations,
        "terminal.background": "#00000000"
      };

      await vscode.workspace.getConfiguration().update("workbench.colorCustomizations", newColorCustomization, vscode.ConfigurationTarget.Global);
      await vscode.workspace.getConfiguration().update("terminal.integrated.gpuAcceleration", "off", vscode.ConfigurationTarget.Global);
    }

    // Save user customizations
    await context.globalState.update('customizations', previousCustomizations);
  }

  // Function to restore previous settings on uninstall
  async function restorePreviousSettings() {
    const previousCustomizations = context.globalState.get('customizations');

    // Delete terminal.background from workbench.colorCustomizations if it's #00000000
    const terminalColorConfig = vscode.workspace.getConfiguration().inspect("workbench.colorCustomizations");
    const currentColorCustomizations = terminalColorConfig?.globalValue || {};
    if (currentColorCustomizations["terminal.background"] === "#00000000") {
      delete currentColorCustomizations["terminal.background"];
      await vscode.workspace.getConfiguration().update("workbench.colorCustomizations", currentColorCustomizations, vscode.ConfigurationTarget.Global);
    }

    if (previousCustomizations?.saved) {
      // Restore only the specific keys we modified
      const terminalColorConfig = vscode.workspace.getConfiguration().inspect("workbench.colorCustomizations");
      const currentColorCustomizations = terminalColorConfig?.globalValue || {};

      if (previousCustomizations.terminalBackground !== undefined) {
        const restoredColorCustomizations = { ...currentColorCustomizations };
        if (previousCustomizations.terminalBackground === null || previousCustomizations.terminalBackground === "#00000000") {
          delete restoredColorCustomizations["terminal.background"];
        } else {
          restoredColorCustomizations["terminal.background"] = previousCustomizations.terminalBackground;
        }
        await vscode.workspace.getConfiguration().update("workbench.colorCustomizations", restoredColorCustomizations, vscode.ConfigurationTarget.Global);
      }

      await vscode.workspace.getConfiguration().update("terminal.integrated.gpuAcceleration", previousCustomizations.gpuAcceleration, vscode.ConfigurationTarget.Global);

      // Preserve the removedFromApplyToAllProfiles flag
      const removedFromApplyToAllProfiles = previousCustomizations.removedFromApplyToAllProfiles;

      // Clear saved state but preserve the removedFromApplyToAllProfiles flag
      await context.globalState.update('customizations', { removedFromApplyToAllProfiles });
    }
  }

  // ####  main commands ######################################################

  async function Install() {

    if (os === 'unknown') {
      vscode.window.showInformationMessage(localize('messages.unsupported'));
      throw new Error('unsupported');
    }

    // BUG: prevent installation on ARM Windows (#9)
    if (process.arch.startsWith("arm") && process.platform === 'win32') {
      vscode.window.showInformationMessage(localize('messages.unsupported'));
      throw new Error('unsupported');
    }

    // BUG: prevent installation on macOS with Electron 32.2.6 used in VSCode 1.96 (#178)
    if (process.versions.electron === "32.2.6" && process.platform === 'darwin') {
      vscode.window.showErrorMessage("Vibrancy doesn't work with this version of VSCode, see [here](https://github.com/illixion/vscode-vibrancy-continued/issues/178) for more info.");
      throw new Error('unsupported');
    }

    try {
      await fs.stat(JSFile);
      await fs.stat(HTMLFile);

      if (os === 'win10') {
        await installRuntimeWin();
      } else {
        await installRuntime();
      }
      await installJS();
      await installHTML();
      await changeTerminalSettings();
    } catch (error) {
      if (error && (error.code === 'EPERM' || error.code === 'EACCES')) {
        vscode.window.showInformationMessage(localize('messages.admin') + error);
      }
      else {
        vscode.window.showInformationMessage(localize('messages.smthingwrong') + error);
      }
      throw error;
    }
  }

  async function Uninstall() {
    // undo settings changes
    await restorePreviousSettings();

    try {
      // uninstall old version
      await fs.stat(HTMLFile);
      await uninstallHTML();
    } finally {

    }

    try {
      await fs.stat(JSFile);

      await uninstallJS();
    } catch (error) {
      if (error && (error.code === 'EPERM' || error.code === 'EACCES')) {
        vscode.window.showInformationMessage(localize('messages.admin') + error);
      }
      else {
        vscode.window.showInformationMessage(localize('messages.smthingwrong') + error);
      }
      throw error;
    }
  }

  async function Update() {
    await Uninstall();
    await Install();
  }

  var installVibrancy = vscode.commands.registerCommand('extension.installVibrancy', async () => {
    await Install();
    enabledRestart();
  });
  var uninstallVibrancy = vscode.commands.registerCommand('extension.uninstallVibrancy', async () => {
    await Uninstall()
    disabledRestart();
  });
  var updateVibrancy = vscode.commands.registerCommand('extension.updateVibrancy', async () => {
    await Update();
    enabledRestart();
  });

  context.subscriptions.push(installVibrancy);
  context.subscriptions.push(uninstallVibrancy);
  context.subscriptions.push(updateVibrancy);

  const currentVersion = context.extension.packageJSON.version;
  let lastVersion = context.globalState.get('lastVersion');
  let updateMsg = "messages.updateNeeded"

  // Detect first time install
  if (!lastVersion) {
    lastVersion = '0.0.0';
    updateMsg = "messages.firstload"
  }

  // Check if the current version is a minor update from the last version
  if (checkRuntimeUpdate(currentVersion, lastVersion)) {
    vscode.window.showInformationMessage(localize(updateMsg), { title: localize('messages.installIde') })
      .then(async (msg) => {
        if (msg) {
          await Update();
          await checkColorTheme();
          await checkElectronDeprecatedType();
          enabledRestart();
        }
      });
    // Update the global state with the current version
    context.globalState.update('lastVersion', currentVersion);
  }

  // Check type compatibility with current Electron
  checkElectronDeprecatedType();

  var lastConfig = vscode.workspace.getConfiguration("vscode_vibrancy");

  vscode.workspace.onDidChangeConfiguration(() => {
    newConfig = vscode.workspace.getConfiguration("vscode_vibrancy");
    if (!deepEqual(lastConfig, newConfig)) {
      lastConfig = newConfig;
      vscode.window.showInformationMessage(localize('messages.configupdate'), { title: localize('messages.reloadIde') })
      .then(async (msg) => {
          await checkElectronDeprecatedType();
          if (msg) {
            await Update();
            // if (newConfig.theme !== vscode.workspace.getConfiguration("vscode_vibrancy")) {
            //   await checkColorTheme();
            // }
            enabledRestart();
          }
        });
      context.globalState.update('lastVersion', currentVersion);
      }
  });
  
  checkDarkLightMode(vscode.window.activeColorTheme)
  vscode.window.onDidChangeActiveColorTheme((theme) => {
    checkDarkLightMode(theme)
  });
}
exports.activate = activate;

// this method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;
