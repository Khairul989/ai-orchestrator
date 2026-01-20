#!/usr/bin/env node

/**
 * Rebuild native modules for Electron
 *
 * This script rebuilds native Node.js modules (like better-sqlite3) to be compatible
 * with Electron's version of Node.js. It runs automatically after npm install via
 * the postinstall script.
 *
 * Note: Uses execSync with hardcoded commands (no user input) - this is safe
 * as the command strings are static and controlled by this script.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Native modules that need to be rebuilt for Electron
const NATIVE_MODULES = ['better-sqlite3'];

// Get the project root directory
const projectRoot = path.resolve(__dirname, '..');

/**
 * Get the installed Electron version from package.json or node_modules
 */
function getElectronVersion() {
  // Try to get from node_modules first (actual installed version)
  const electronPkgPath = path.join(projectRoot, 'node_modules', 'electron', 'package.json');
  if (fs.existsSync(electronPkgPath)) {
    const electronPkg = JSON.parse(fs.readFileSync(electronPkgPath, 'utf8'));
    return electronPkg.version;
  }

  // Fall back to package.json (may have ^ or ~ prefix)
  const pkgPath = path.join(projectRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const electronVersion = pkg.devDependencies?.electron || pkg.dependencies?.electron;

  if (electronVersion) {
    // Remove ^ or ~ prefix if present
    return electronVersion.replace(/^[\^~]/, '');
  }

  throw new Error('Could not determine Electron version');
}

/**
 * Get the system architecture
 */
function getArch() {
  return process.arch; // 'x64', 'arm64', etc.
}

/**
 * Get the platform
 */
function getPlatform() {
  return process.platform; // 'darwin', 'win32', 'linux'
}

/**
 * Check if a native module exists and needs rebuilding
 */
function moduleExists(moduleName) {
  const modulePath = path.join(projectRoot, 'node_modules', moduleName);
  return fs.existsSync(modulePath);
}

/**
 * Rebuild a native module using node-gyp
 */
function rebuildModule(moduleName, electronVersion, arch) {
  const modulePath = path.join(projectRoot, 'node_modules', moduleName);

  if (!moduleExists(moduleName)) {
    console.log(`  Skipping ${moduleName} (not installed)`);
    return true;
  }

  console.log(`  Rebuilding ${moduleName}...`);

  try {
    // Use node-gyp rebuild with Electron-specific flags
    // Note: This command is fully static - no user input is interpolated
    const command = `npx node-gyp rebuild --runtime=electron --target=${electronVersion} --arch=${arch} --dist-url=https://electronjs.org/headers`;

    execSync(command, {
      cwd: modulePath,
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_runtime: 'electron',
        npm_config_target: electronVersion,
        npm_config_arch: arch,
        npm_config_disturl: 'https://electronjs.org/headers',
      },
    });

    console.log(`  ✓ ${moduleName} rebuilt successfully`);
    return true;
  } catch (error) {
    console.error(`  ✗ Failed to rebuild ${moduleName}:`, error.message);
    return false;
  }
}

/**
 * Main function
 */
function main() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Rebuilding native modules for Electron           ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');

  try {
    const electronVersion = getElectronVersion();
    const arch = getArch();
    const platform = getPlatform();

    console.log(`Platform:         ${platform}`);
    console.log(`Architecture:     ${arch}`);
    console.log(`Electron version: ${electronVersion}`);
    console.log(`Modules to rebuild: ${NATIVE_MODULES.join(', ')}`);
    console.log('');

    let allSucceeded = true;

    for (const moduleName of NATIVE_MODULES) {
      if (!rebuildModule(moduleName, electronVersion, arch)) {
        allSucceeded = false;
      }
    }

    console.log('');

    if (allSucceeded) {
      console.log('✓ All native modules rebuilt successfully!');
      console.log('');
      process.exit(0);
    } else {
      console.error('✗ Some modules failed to rebuild. See errors above.');
      console.log('');
      process.exit(1);
    }
  } catch (error) {
    console.error('');
    console.error('Error:', error.message);
    console.error('');
    process.exit(1);
  }
}

// Run the script
main();
