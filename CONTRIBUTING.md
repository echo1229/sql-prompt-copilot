# 贡献指南

## 开发环境

1. 安装 [Node.js 18+](https://nodejs.org/)
2. 安装 [Rust 1.77.2+](https://rustup.rs/)
3. 安装 Visual Studio Build Tools，勾选"使用 C++ 的桌面开发"工作负载

## 开发流程

```bash
# 安装依赖
npm install

# 启动开发模式（前端 + Rust 热重载）
npm run tauri dev

# 仅前端开发
npm run dev
```

## 提交规范

使用语义化提交信息：

- `feat:` 新功能
- `fix:` 修复 bug
- `docs:` 文档更新
- `refactor:` 重构
- `perf:` 性能优化
- `test:` 测试
- `chore:` 构建/工具链变更

## Pull Request

1. Fork 本仓库
2. 创建功能分支：`git checkout -b feat/your-feature`
3. 提交更改：`git commit -m "feat: add your feature"`
4. 推送分支：`git push origin feat/your-feature`
5. 创建 Pull Request

## 代码规范

- TypeScript 严格模式
- 使用 Shadcn UI 组件，不手写基础组件
- Rust 代码遵循 `cargo fmt` 和 `cargo clippy`
