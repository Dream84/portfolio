放置便携 Node 运行时的目录（可选）
====================================

本目录用于让 MyPortfolio 完全脱离机器上的 Node / npm 安装：

1. 从 Node 官网下载 Windows 版压缩包（node-v20.x.x-win-x64.zip）；
2. 解压后把 `node.exe` 复制到本目录，即成为：

   myportfolio/runtime/node.exe

3. 之后双击根目录的 `MyPortfolio.cmd` 就会优先使用该运行时；
   本目录为空时，启动器回退使用 PATH 中的 `node`。

说明：
- 前端页面已是构建产物（dist/），启动时不需要 npm、不需要联网；
- 后端接口由工程内 `node_modules/tsx` 直接运行 TypeScript 源码，
  因此 `node_modules` 需要保持存在（无需重新 npm install）。
