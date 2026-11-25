将 `.env` 等 Git 忽略的文件复制到新工作树。可使用 `symlink <path>` 与新工作树共享 `node_modules` 等文件或目录。将 `.worktreeinclude` 放在主检出目录的根目录。

```gitignore
# .worktreeinclude
.env
.env.*
config/secrets.json
symlink node_modules
```

直接填写的规则和 `copy <pattern>` 使用 gitignore 语法。链接只能使用一个字面相对路径。两种模式均要求源路径被 Git 忽略，只在主检出目录内读取源文件，并保留已跟踪或已存在的目标。支持写时复制的文件系统（如 APFS 和 btrfs）会使用克隆。Windows 上的目录链接使用目录联接，文件链接需要符号链接权限。创建链接失败时会跳过该项。忽略链接目录时，目录名末尾应省略斜杠，以便 Git 同时忽略新工作树中的链接。

需要 Paseo 0.10.3 或更新版本，守护进程的 `PATH` 中必须有 `git`。文件只在守护进程所在机器上从主检出目录复制到工作树。

复制会在工作区创建时触发，可能晚于代理启动。如果代理启动后需要立即读取这些文件，请在 `paseo.json` 中通过 `worktree.setup` 配置复制步骤。
