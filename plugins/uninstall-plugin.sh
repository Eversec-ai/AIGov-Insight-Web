#!/bin/bash

# AIGov-Insight Plugin Uninstaller
# 支持 Linux / macOS / Windows (Git Bash / WSL)
# 使用方法: ./uninstall-plugin.sh

set -e

PLUGIN_NAME="aigov-insight"

echo "🗑️  Uninstalling ${PLUGIN_NAME}..."

detect_os() {
    case "$(uname -s)" in
        Linux*)     echo "linux";;
        Darwin*)    echo "macos";;
        CYGWIN*|MINGW*|MSYS*) echo "windows";;
        *)          echo "unknown";;
    esac
}

OS=$(detect_os)
echo "🖥️  Detected OS: ${OS}"

echo "🔧 Uninstalling plugin from OpenClaw..."
rm ~/.openclaw/extensions/aigov-insight/ -fr

echo "🔄 Restarting OpenClaw Gateway..."
openclaw gateway stop 2>/dev/null || true
openclaw gateway start

echo ""
echo "✅ ${PLUGIN_NAME} uninstalled successfully!"
echo ""
echo "📝 Verify removal:"
echo "   openclaw plugins list"
