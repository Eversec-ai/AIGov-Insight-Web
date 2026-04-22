#!/bin/bash

# AIGov-Insight Plugin Installer (预编译版本)
# 支持 Linux/macOS/Windows (Git Bash 或 WSL)

set -e

PLUGIN_NAME="aigov-insight"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "📦 Installing ${PLUGIN_NAME}..."

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

echo "🔧 Installing plugin to OpenClaw..."
openclaw plugins install "$SCRIPT_DIR"

echo "🔄 Restarting OpenClaw Gateway..."
openclaw gateway stop 2>/dev/null || true
openclaw gateway start

echo ""
echo "✅ ${PLUGIN_NAME} installed successfully!"
echo ""
echo "📝 规则配置:"
echo "   - primary-rules.json  主规则库 (从模板复制)"
echo "   - custom-rules.json   自定义规则库"
echo "   - templates/          规则模板目录"
echo ""
echo "📝 Verify installation:"
echo "   openclaw plugins list"
