# 捉鸡记账本

贵州捉鸡麻将记分微信小程序，带 Go 接口、实时多人房间和管理后台。

单人记账只存在本机。多人模式要联网：进页面即开房，分享房间码，各自填写自己的成绩，由服务端按捉鸡规则结算。不登录也可以玩单人记账和小游戏；统计、我的、多人入座需要微信授权。

计分细则见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。该文档前半部分仍按早期纯前端、同一台手机轮流申报来写，当前多人流程以本 README 为准。

## 目录

```text
.
├── pages/          小程序页面。首页、统计、我的、单人记账、多人房间、祖玛
├── pages/cutrope/  割绳子分包
├── pages/kingdomrush/ 王国保卫战分包
├── utils/          登录、接口、房间 WebSocket、捉鸡结算
├── server/         Go + GORM + MySQL + JWT 接口
└── admin/          Vue 3 + Element Plus 管理后台
```

## 小程序

1. 用微信开发者工具导入仓库根目录。
2. 开发阶段可以使用测试号。`project.config.json` 里目前是 `touristappid`。
3. 编译后底部导航是首页、统计、我的。

接口地址在 [utils/config.js](utils/config.js)，默认 `http://127.0.0.1:8080`。开发者工具里的「不校验合法域名」已打开，可以直接访问本机。真机调试要把这个地址改成电脑的局域网地址，并在微信公众平台配置 request 合法域名和 socket 合法域名。

未配置 `WECHAT_APPID` 时，服务端把小程序本地生成的开发身份当成 openid，方便在开发者工具里反复登录同一个用户。正式环境必须填写真实 AppID 和 AppSecret。

## 接口

需要 Go 1.23 和 MySQL 8。数据库访问使用 GORM。表结构仍在启动时用 SQL 迁移创建。

```sql
CREATE DATABASE mahjong CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

默认连接串是 `root:mahjong@tcp(127.0.0.1:3306)/mahjong`。变量说明见 [server/.env.example](server/.env.example)。启动时会加载 server 目录下的 `.env`（与 `main.go` 同级；从仓库根目录启动也会找到它）。同一项的优先级是 `.env`、系统环境变量、代码默认值。`.env` 里写了空值也会盖过系统环境变量。文件不存在时使用环境变量和默认值。

```powershell
cd server
go run .
```

启动时会建表，并在没有管理员时写入种子账号 `admin` / `admin123`。管理后台跨域默认允许 `http://localhost:5173`。JWT 默认密钥只适合本机，部署前改掉 `JWT_SECRET`。

监听地址默认 `:8080`。健康检查是 `GET /healthz`。

日志写在 `logs/`，按天分成 `access`、`info`、`error` 三份，默认保留 30 天。SQL 进 info，失败时同时进 error。除微信登录、游客登录和管理员登录外，访问日志包含原始请求和响应。`Authorization` 不写入日志。

结算规则和开房条件的测试：

```powershell
cd server
go test ./...
```

## 管理后台

```powershell
cd admin
npm install
npm run dev
```

浏览器打开 `http://localhost:5173`。开发服务器把 `/api` 代理到 `http://127.0.0.1:8080`。

后台可以查看概览、微信用户、牌局明细和弹幕、小游戏排行。

## 多人房间

- 登录用户进入多人模式会创建房间。分享卡片带上房间码。
- 右上角是当前在线人数。没有用户身份的连接显示为游客。
- 只有登录用户能入座。房主必须入座，至少两人才能开局。
- 牌桌在上方。头像上面是累计分，正分红，负分绿。下方只填写自己这一把。
- 全部入座玩家提交后，服务端结算并广播。房主可以开始下一把，或结束整场。
- 房间里任何人都可以发弹幕，同一连接 10 秒一条。
- 统计页默认展示当前用户近 30 天已结束的牌局。净分大于 0 记为胜，小于 0 记为负，等于 0 记为平。

## 小游戏

祖玛、割绳子、王国保卫战在通关或失败时自动上报。未登录时记在游客标识上，之后微信登录会把这些记录归到该用户。
