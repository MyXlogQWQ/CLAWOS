# 安装 nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# 让 nvm 生效
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# 安装 Node.js 22
nvm install 22

# 验证
node -v   # 应该显示 v22.x.x
npm -v    # 应该显示 10.x.x

# 安装 openclaw
npm install -g openclaw@latest --registry=https://registry.npmmirror.com

openclaw -v

# 配置 openclaw


