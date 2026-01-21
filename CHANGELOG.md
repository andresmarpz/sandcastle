# Changelog

## [0.1.16](https://github.com/andresmarpz/sandcastle/compare/v0.1.15...v0.1.16) (2026-01-21)


### Features

* add parentToolCallId support for subagent tracking ([#81](https://github.com/andresmarpz/sandcastle/issues/81)) ([36d6243](https://github.com/andresmarpz/sandcastle/commit/36d624320d6abaaa128cc16502549ab154753e9b))
* **desktop:** bundle Bun server as Tauri sidecar ([#85](https://github.com/andresmarpz/sandcastle/issues/85)) ([213351c](https://github.com/andresmarpz/sandcastle/commit/213351c6dd02def878b77f988526c27fda4f08f1))


### Bug Fixes

* **ci:** get PR branch name from release-please output ([#84](https://github.com/andresmarpz/sandcastle/issues/84)) ([ead6900](https://github.com/andresmarpz/sandcastle/commit/ead6900067af3e7f6eab3780b11869e18d75eb4d))
* **ci:** update bun.lock after release-please version bumps ([#83](https://github.com/andresmarpz/sandcastle/issues/83)) ([1b7ad5e](https://github.com/andresmarpz/sandcastle/commit/1b7ad5e3f2060b7c9c7c07d62b57ae20bc1556eb))
* recreate bun.lock ([c4f77ba](https://github.com/andresmarpz/sandcastle/commit/c4f77baf29f9226979e6f7bea67dc6761b57a480))
* update toke usage after turn finish ([c86ab96](https://github.com/andresmarpz/sandcastle/commit/c86ab96055d5282d1996654ec05ecfa031899d10))

## [0.1.15](https://github.com/andresmarpz/sandcastle/compare/v0.1.14...v0.1.15) (2026-01-21)


### Features

* animate session list when deleting one session ([6f34a52](https://github.com/andresmarpz/sandcastle/commit/6f34a529552b1fd07c9ca1a4adfda08bc04e0b7d))
* improve context menu text hierarchy ([def30b3](https://github.com/andresmarpz/sandcastle/commit/def30b33b5e5fddf41cb880dae0ee4d1e1f4d233))
* improve inter font rendering ([b126f35](https://github.com/andresmarpz/sandcastle/commit/b126f3540d90a2526e353686631f13766812ffe6))
* improve sidebar styling ([ab0a65b](https://github.com/andresmarpz/sandcastle/commit/ab0a65b544ed4fd5bb3776f04848395da9a69bb7))
* remove overlay blur from dialogs ([78d9aa3](https://github.com/andresmarpz/sandcastle/commit/78d9aa39891566b0d12f44fa947a8f3b5d0bc24a))
* replace send button with arrow icon ([746e886](https://github.com/andresmarpz/sandcastle/commit/746e8864e4f51ad853b64242dc9cbc7ae3afd1a6))
* set scrolldown animations to instant ([cd055f5](https://github.com/andresmarpz/sandcastle/commit/cd055f5b38c12b9e13bf0e3764a12e0417b594fc))


### Bug Fixes

* accurate context window percentage calculation ([#79](https://github.com/andresmarpz/sandcastle/issues/79)) ([21befba](https://github.com/andresmarpz/sandcastle/commit/21befba35e9b08723abb30fdabfdfe5374a72260))
* attempt to improve session view transition ([74cdd19](https://github.com/andresmarpz/sandcastle/commit/74cdd1953ff1bc9f6f53e22565078b024354c6e2))
* remove context menu animation on open ([fe51e55](https://github.com/andresmarpz/sandcastle/commit/fe51e5582a8c9436bb85d84c10d737fcc509c218))
* **ui:** improve chat input footer mobile responsiveness ([#75](https://github.com/andresmarpz/sandcastle/issues/75)) ([e364461](https://github.com/andresmarpz/sandcastle/commit/e364461ce23add9c3c67bcf8acc4fba1c77d78b0))
* **ui:** improve file picker mobile UX with bottom sheet ([#74](https://github.com/andresmarpz/sandcastle/issues/74)) ([704cec8](https://github.com/andresmarpz/sandcastle/commit/704cec8ea78f51e36f0a2072bd56a9be873da64b))
* **web:** skip vercel builds for release-please branches ([#77](https://github.com/andresmarpz/sandcastle/issues/77)) ([00550c4](https://github.com/andresmarpz/sandcastle/commit/00550c4727e45f00e2ddd2d569b2f08d62ae54cb))

## [0.1.14](https://github.com/andresmarpz/sandcastle/compare/v0.1.13...v0.1.14) (2026-01-21)


### Features

* **session:** auto-rename sessions on first message ([#72](https://github.com/andresmarpz/sandcastle/issues/72)) ([834d86f](https://github.com/andresmarpz/sandcastle/commit/834d86ffe5b895407ac8255c86456976f9f3e634))
* **ui:** add streaming loading indicator with pixel spinner ([#73](https://github.com/andresmarpz/sandcastle/issues/73)) ([8bd04d0](https://github.com/andresmarpz/sandcastle/commit/8bd04d02c1bf3e2cd7809ad9054054a291cd1827))


### Bug Fixes

* use default mode build for sessions ([2cba7ed](https://github.com/andresmarpz/sandcastle/commit/2cba7ed78822c5cfd9d5a783efc179214f8e8179))

## [0.1.13](https://github.com/andresmarpz/sandcastle/compare/v0.1.12...v0.1.13) (2026-01-21)


### Features

* add git diff stats to session metadata ([#70](https://github.com/andresmarpz/sandcastle/issues/70)) ([5b8fdfe](https://github.com/andresmarpz/sandcastle/commit/5b8fdfe66d953abc68ae8b0078a972494a5714ec))


### Bug Fixes

* pipe error text to ask user question part ([f915d90](https://github.com/andresmarpz/sandcastle/commit/f915d90c177d30942514828d29d8494db1ede351))
* remove debug console.logs from frontend ([#66](https://github.com/andresmarpz/sandcastle/issues/66)) ([73c7eda](https://github.com/andresmarpz/sandcastle/commit/73c7edab1c11b449162feef2ebdcb4ceaf5b3510))
* set proper session status ([#69](https://github.com/andresmarpz/sandcastle/issues/69)) ([20ccd1a](https://github.com/andresmarpz/sandcastle/commit/20ccd1addaacbe3b11aebe696b24abfb80aa1a73))
* status indicator waiting_input not showing ([24cd119](https://github.com/andresmarpz/sandcastle/commit/24cd1196adb5c0a4db0b4248bcc0ae9440f42d35))

## [0.1.12](https://github.com/andresmarpz/sandcastle/compare/v0.1.11...v0.1.12) (2026-01-20)


### Features

* ask user question and plan mode working ([0fdd655](https://github.com/andresmarpz/sandcastle/commit/0fdd655ceeb1e350800eef251122632c00ddc9e5))
* create modes with tool approval flow ([#65](https://github.com/andresmarpz/sandcastle/issues/65)) ([ecb6c72](https://github.com/andresmarpz/sandcastle/commit/ecb6c726d50b71230adcddc14d277056ea8c2a5d))
* many improvements to plan mode ui ([3764c27](https://github.com/andresmarpz/sandcastle/commit/3764c27e2ba3e2221ce475eece23bf9dc422e22a))
* **ui:** increase sidebar min width and collapse threshold by 60px ([8bff566](https://github.com/andresmarpz/sandcastle/commit/8bff5663af4587212f2c9bef6613ba788b08d143))


### Bug Fixes

* pending tool approvals after stream resume ([b0f6ef8](https://github.com/andresmarpz/sandcastle/commit/b0f6ef8160dbdbd121757abdb81b821daf5131a7))

## [0.1.11](https://github.com/andresmarpz/sandcastle/compare/v0.1.10...v0.1.11) (2026-01-20)


### Features

* add harness selector dropdown to chat input ([#60](https://github.com/andresmarpz/sandcastle/issues/60)) ([98d4a3b](https://github.com/andresmarpz/sandcastle/commit/98d4a3b7896c2b74d9302a0e46fbf95c5e367f69))


### Bug Fixes

* **ui:** use default backend URL when localStorage is not set ([#63](https://github.com/andresmarpz/sandcastle/issues/63)) ([05c8192](https://github.com/andresmarpz/sandcastle/commit/05c8192d7f2a646f95a9bc1b412efa31c113971e))

## [0.1.10](https://github.com/andresmarpz/sandcastle/compare/v0.1.9...v0.1.10) (2026-01-19)


### Features

* add sidebar worktree item section ([3c763ec](https://github.com/andresmarpz/sandcastle/commit/3c763ec2c42d863e3acb9b4b9679b703e0ce3df8))


### Bug Fixes

* remove unused variable from chat-view ([0714961](https://github.com/andresmarpz/sandcastle/commit/071496162e6e6e0c88442eef4bd0ac292cdea9bb))


### Performance Improvements

* **ui:** reduce unnecessary re-renders in chat message list ([#56](https://github.com/andresmarpz/sandcastle/issues/56)) ([db81d94](https://github.com/andresmarpz/sandcastle/commit/db81d94d2675cd99f5b38bf6b18529da99aa5cbe))

## [0.1.9](https://github.com/andresmarpz/sandcastle/compare/v0.1.8...v0.1.9) (2026-01-19)


### Features

* **ui:** improve ChatInput footer layout and mode selector ([#54](https://github.com/andresmarpz/sandcastle/issues/54)) ([37df5ab](https://github.com/andresmarpz/sandcastle/commit/37df5ab5f9e99d58213816208d8317ef189afeaa))

## [0.1.8](https://github.com/andresmarpz/sandcastle/compare/v0.1.7...v0.1.8) (2026-01-19)


### Bug Fixes

* **desktop:** update updater signing pubkey ([fa243ef](https://github.com/andresmarpz/sandcastle/commit/fa243ef9548d8bcbc519ee1b4fcc79bb1bba9ed8))

## [0.1.7](https://github.com/andresmarpz/sandcastle/compare/v0.1.6...v0.1.7) (2026-01-19)


### Bug Fixes

* **ci:** default empty password for updater signing key ([688bfd4](https://github.com/andresmarpz/sandcastle/commit/688bfd448cedece4dc692400a9a1ed6c338f4a75))

## [0.1.6](https://github.com/andresmarpz/sandcastle/compare/v0.1.5...v0.1.6) (2026-01-19)


### Bug Fixes

* **desktop:** enable updater artifacts generation ([8cdad7d](https://github.com/andresmarpz/sandcastle/commit/8cdad7dff28395097245e9d5d0091ea4c3c61c68))

## [0.1.5](https://github.com/andresmarpz/sandcastle/compare/v0.1.4...v0.1.5) (2026-01-19)


### Features

* **desktop:** add auto-updater with toast notifications ([9ad3260](https://github.com/andresmarpz/sandcastle/commit/9ad32608b93dc1f33664e907570a2993ca42171f))
* **desktop:** add auto-updater with toast notifications ([#48](https://github.com/andresmarpz/sandcastle/issues/48)) ([f9c1840](https://github.com/andresmarpz/sandcastle/commit/f9c18406b0bb231ca6e33565483f685503b39e81))

## [0.1.4](https://github.com/andresmarpz/sandcastle/compare/v0.1.3...v0.1.4) (2026-01-19)


### Bug Fixes

* chatview layout scroll to bottom ([68fbb07](https://github.com/andresmarpz/sandcastle/commit/68fbb076dcdad84316c641610e45be1b7057981b))
* overscrolling bug and safari recalculation lag ([1fae9dc](https://github.com/andresmarpz/sandcastle/commit/1fae9dcac14340959962cadf849e402754df9ef4))

## [0.1.3](https://github.com/andresmarpz/sandcastle/compare/v0.1.2...v0.1.3) (2026-01-19)


### Features

* **ui:** add Open dropdown to chat session metadata panel ([#46](https://github.com/andresmarpz/sandcastle/issues/46)) ([3677328](https://github.com/andresmarpz/sandcastle/commit/3677328c4ecaaa496c647768838e512d7f50a3f6))


### Bug Fixes

* **ui:** display correct tool names during streaming instead of 'invocation' ([#43](https://github.com/andresmarpz/sandcastle/issues/43)) ([ec7e43e](https://github.com/andresmarpz/sandcastle/commit/ec7e43ede0f398ab06a2b4f4794b19b317a198d5))

## [0.1.2](https://github.com/andresmarpz/sandcastle/compare/v0.1.1...v0.1.2) (2026-01-19)


### Bug Fixes

* modify relelease-please ci to update all versions correctly ([81a5563](https://github.com/andresmarpz/sandcastle/commit/81a5563122c24d9cee52b0328ff6b00651e1f138))
* upload desktop builds to release-please release instead of creating new one ([8436e2e](https://github.com/andresmarpz/sandcastle/commit/8436e2e13da35618cf19d46c383112a698d34228))
* use toml type for Cargo.toml in release-please config ([1598c7c](https://github.com/andresmarpz/sandcastle/commit/1598c7c24a4fb1fefdf52e3c1577ce648f37e00b))

## [0.1.1](https://github.com/andresmarpz/sandcastle/compare/v0.1.0...v0.1.1) (2026-01-19)


### Features

* add @sandcastle/cli package ([22a584f](https://github.com/andresmarpz/sandcastle/commit/22a584f22a723bb436b2517a37f3caaa924cf5b5))
* add @sandcastle/config package for worktree initialization ([77fe4aa](https://github.com/andresmarpz/sandcastle/commit/77fe4aae92e3a0290dc21d742642fa23a79c3c78))
* add @sandcastle/config package for worktree initialization ([c0c1109](https://github.com/andresmarpz/sandcastle/commit/c0c1109f29e07437e9420a2cd0021fb042eb3b68))
* add @sandcastle/http server package ([015e77e](https://github.com/andresmarpz/sandcastle/commit/015e77e52c01ccd090e98a914720ea9f570a02b6))
* add @sandcastle/http server package ([6b863e5](https://github.com/andresmarpz/sandcastle/commit/6b863e56c35ed1e9a76629a816a3510728f935b9))
* add @sandcastle/petname package ([3680a1a](https://github.com/andresmarpz/sandcastle/commit/3680a1a415fc35b806b3ac79988480fe1c0a6807))
* add @sandcastle/petname package for random name generation ([671d3cb](https://github.com/andresmarpz/sandcastle/commit/671d3cbaeb100b91603cb7c3b585d1a2a5b06faa))
* add @sandcastle/rpc package ([b188731](https://github.com/andresmarpz/sandcastle/commit/b1887310df143996febf90abd8e317e300c61ce9))
* add @sandcastle/rpc package with effect rpc schema and handlers ([59f49b9](https://github.com/andresmarpz/sandcastle/commit/59f49b92eee1510ae99b488469a254aaf67ca6ef))
* add @sandcastle/storage package ([8d71a6b](https://github.com/andresmarpz/sandcastle/commit/8d71a6bae93282be19bbb6d900db71e83b0769e9))
* add @sandcastle/storage package for sqlite persistence ([5e6d2ad](https://github.com/andresmarpz/sandcastle/commit/5e6d2ad5d613878c2e0defb1552f3109b16468d0))
* add @sandcastle/worktree package ([bd1d5ee](https://github.com/andresmarpz/sandcastle/commit/bd1d5ee76879d929d713be57e468f682acb96f95))
* add automated version management with release-please ([607cd24](https://github.com/andresmarpz/sandcastle/commit/607cd24d2e3bafe3c9141e21fc6e778cfc9eb1b5))
* add autonomous mode toggle to chat ([166fed2](https://github.com/andresmarpz/sandcastle/commit/166fed275aa68b2d1e40ebe6a5b69d6647cda8cb))
* add autonomous mode toggle to chat ([ee5470a](https://github.com/andresmarpz/sandcastle/commit/ee5470abb906142df17ac3ec515bdd3b4a2b0e5e))
* add autonomous mode toggle to chat input ([2a1a990](https://github.com/andresmarpz/sandcastle/commit/2a1a9906bb68101fe943c9e23fd087dff3a52783))
* add autonomous mode toggle to chat input ([69eae1d](https://github.com/andresmarpz/sandcastle/commit/69eae1dfffa00f932843160ec375cf5dfd9498b4))
* add basic request logging to HTTP server ([77e5b0d](https://github.com/andresmarpz/sandcastle/commit/77e5b0d50156b84d8962b77e916600517964428e))
* add basic request logging to HTTP server ([e9fdd87](https://github.com/andresmarpz/sandcastle/commit/e9fdd87c7d8d6a3e217b0071d2ec0c6d5d8e763c))
* add ci workflow for format, lint, and typecheck ([#13](https://github.com/andresmarpz/sandcastle/issues/13)) ([05e4ebb](https://github.com/andresmarpz/sandcastle/commit/05e4ebb0924c54807daeef1f561f8683e15faced))
* add cli commands for project and worktree management ([5216340](https://github.com/andresmarpz/sandcastle/commit/5216340a1a85fba7acd0ab053516d0be8e71a84e))
* add desktop app with tauri ([6bb5f92](https://github.com/andresmarpz/sandcastle/commit/6bb5f92459b3712bef91d1da653a0e0e352a6f60))
* add editor options to worktree commands ([3068b07](https://github.com/andresmarpz/sandcastle/commit/3068b07bf040d1975c1101b4f73a4e1e523bf8e3))
* add editor options to worktree commands ([0cfd708](https://github.com/andresmarpz/sandcastle/commit/0cfd708aa3e15d2b4ca4d6ac6c6bd111a3f47cbd))
* add effect-based git worktree service ([6a5055a](https://github.com/andresmarpz/sandcastle/commit/6a5055a157a9802d1d6544e97a97483cc179b2f7))
* add open dropdown to worktree panel ([cc4b257](https://github.com/andresmarpz/sandcastle/commit/cc4b257f57af1b776aae440e72e151c7b2e847af))
* add open dropdown to worktree panel ([cc08f1f](https://github.com/andresmarpz/sandcastle/commit/cc08f1fe54c496089dea71393cefe4164760197d))
* add project service with sqlite storage ([2446b4e](https://github.com/andresmarpz/sandcastle/commit/2446b4e5b73636ae10db3d59e30aba38d8e7a5b7))
* add RPC schemas and HTTP handlers for storage entities ([e6660a9](https://github.com/andresmarpz/sandcastle/commit/e6660a922b97f61032d2eeaa8b67600aafe11141))
* add startup background sync for worktrees ([743e422](https://github.com/andresmarpz/sandcastle/commit/743e422d835870528c7556c292ce895b48f31beb))
* add sync mutation atom to frontend api ([5f62ebc](https://github.com/andresmarpz/sandcastle/commit/5f62ebcb500d878a4c4ba587e3eb49c4b457ae94))
* add Workspaces link to sidebar ([f922ed7](https://github.com/andresmarpz/sandcastle/commit/f922ed777ef99fbdfaa10f86763d884b0ddbefcd))
* add worktree remove alias for consistency with project remove ([5d93303](https://github.com/andresmarpz/sandcastle/commit/5d93303950aa24df11d5d6903a26eb9854bdd67e))
* add worktree.sync rpc endpoint definition ([7b577ec](https://github.com/andresmarpz/sandcastle/commit/7b577ecf41ccafe48e5482d9fc33201611a9b58a))
* allow creating sessions on main or worktree ([ce8df8e](https://github.com/andresmarpz/sandcastle/commit/ce8df8e07b98878e8ec485c2d4be42d299d828c7))
* auto-generate worktree names with petname ([6ce0387](https://github.com/andresmarpz/sandcastle/commit/6ce0387929db2bf1c5316b9f8156c6cf0c22d039))
* auto-generate worktree names with petname ([6dd20c6](https://github.com/andresmarpz/sandcastle/commit/6dd20c67593c0789ecc34597bfa602a149ca7261))
* create Claude stop hook to run tooling ([ca3d78a](https://github.com/andresmarpz/sandcastle/commit/ca3d78aef1e5f2a3cfb41d502dd412f1e550d853))
* **desktop:** add effect-atom rpc client setup ([02e1876](https://github.com/andresmarpz/sandcastle/commit/02e1876fd4bd0f58da548287b44b4f5154c1f150))
* **desktop:** migrate rpc client to effect-atom ([#14](https://github.com/andresmarpz/sandcastle/issues/14)) ([6533e24](https://github.com/andresmarpz/sandcastle/commit/6533e2437c300fbd473c02732683f8f6e5317132))
* **http:** add cors middleware ([e1ff95d](https://github.com/andresmarpz/sandcastle/commit/e1ff95da9ed0786f1fab2f86067671dc7b0f7157))
* **http:** add repository and worktree RPC handlers ([62f2afc](https://github.com/andresmarpz/sandcastle/commit/62f2afc4a9c7e5b56021c8401c2cbd42fd30ead3))
* implement worktree sync logic and rpc handler ([5bb2cd6](https://github.com/andresmarpz/sandcastle/commit/5bb2cd69e23782a685632f0edb7733e480b1acc8))
* improve cli worktree commands ([c5dc46d](https://github.com/andresmarpz/sandcastle/commit/c5dc46d5f5ee04a1b6a14961f6e01cbddb260837))
* integrate config service with worktree create ([4e032d8](https://github.com/andresmarpz/sandcastle/commit/4e032d87f01e9a9df33fbf7f634e5733b24ef69c))
* integrate config service with worktree create command ([9932f58](https://github.com/andresmarpz/sandcastle/commit/9932f58cde154e7ecc965eedf8321d36f2b9ff7e))
* **rpc:** add common error types for RPC transport ([43bdbaa](https://github.com/andresmarpz/sandcastle/commit/43bdbaa0c465f8541277204bed9e4a0bcfc47e0b))
* **rpc:** add repository RPC schema and errors ([06824bc](https://github.com/andresmarpz/sandcastle/commit/06824bc67cc3036800648ea4335fbc17f3782842))
* **rpc:** add session and agent RPC schemas ([5cb5e0b](https://github.com/andresmarpz/sandcastle/commit/5cb5e0b04785037bc40d026337cf9f27838c2f75))
* **rpc:** add worktree RPC schema and errors ([0cdf230](https://github.com/andresmarpz/sandcastle/commit/0cdf23043bcdfda40e0086fe3c1b5d2986560bd7))
* run bun install automatically after creating worktree ([0a47850](https://github.com/andresmarpz/sandcastle/commit/0a4785009894e7c6e0ac2507bbd1e3197b3998da))
* run bun install automatically after creating worktree ([d51de07](https://github.com/andresmarpz/sandcastle/commit/d51de07070e5fdb3d874ccd1d074a6c741aa425d))
* **sidebar:** adopt ShadcnUI sidebar with drag-to-resize support ([87d26e4](https://github.com/andresmarpz/sandcastle/commit/87d26e4cde85dfed236741a883e443fa713e7b97))
* **sidebar:** adopt ShadcnUI sidebar with drag-to-resize support ([9e6cc9d](https://github.com/andresmarpz/sandcastle/commit/9e6cc9dd6b255c10da36721a37fe1228d2fe673c))
* sync worktrees on mount and deselect removed ones ([19907ec](https://github.com/andresmarpz/sandcastle/commit/19907ec89d472423e4a5a758f03b742f25d7e89b))
* **ui:** add dedicated ReadPart component for file read tool rendering ([614a7b9](https://github.com/andresmarpz/sandcastle/commit/614a7b954012e9272da620d6070cc64f8b6e4db0))
* **ui:** add dedicated ReadPart component for file read tool rendering ([a39268d](https://github.com/andresmarpz/sandcastle/commit/a39268db0183068402f8ce0aaf915a1dcdccd74a))
* **ui:** add dedicated TodoWritePart component for task list rendering ([c60003f](https://github.com/andresmarpz/sandcastle/commit/c60003fae112c034273f597d15245e1853460dc2))
* **ui:** add dedicated TodoWritePart component for task list rendering ([f7525c3](https://github.com/andresmarpz/sandcastle/commit/f7525c38f01b1768abd27a0e8776ad36c2c6544b))
* **ui:** add dedicated WritePart and BashPart tool components ([0018c07](https://github.com/andresmarpz/sandcastle/commit/0018c071d56583535250fef5cc8db80f5b94855a))
* **ui:** add dedicated WritePart and BashPart tool components ([8c596e7](https://github.com/andresmarpz/sandcastle/commit/8c596e791752b0d5405eb190dac3893b8a122dd4))
* **ui:** enhance worktrees index with dashboard overview ([b6ff090](https://github.com/andresmarpz/sandcastle/commit/b6ff0903610ea7418c3c8856bfd646e5d88bd546))
* **ui:** enhance worktrees index with dashboard overview ([997369c](https://github.com/andresmarpz/sandcastle/commit/997369cbf8056d9e2dc849575b9b651897cc570b))
* worktree sync to clean up orphaned db records ([fd4c963](https://github.com/andresmarpz/sandcastle/commit/fd4c963d915f8f7d03eb35b066c9cdbc4c41de2a))


### Bug Fixes

* **ci:** remove --bun flag to fix prettier plugin resolution ([9632213](https://github.com/andresmarpz/sandcastle/commit/9632213acb271783f60fed84e7c43e9c00ab2f48))
* **desktop:** formatting issues ([d4220d3](https://github.com/andresmarpz/sandcastle/commit/d4220d3cf76cb7f956bb51f9fd633d7800306694))
* file picker only worked on worktrees ([98bfa03](https://github.com/andresmarpz/sandcastle/commit/98bfa03a7ad63b4bc10e395757c52270710df71f))
* formatting and integrate worktree panel with layout ([5001b19](https://github.com/andresmarpz/sandcastle/commit/5001b1928dbed5d9752b60eaf15d8d838e0e7bc3))
* improve autonomous mode icon contrast ([f277a5d](https://github.com/andresmarpz/sandcastle/commit/f277a5dfff52ee7aefb2e87eb10f24fdf5c473ee))
* make header draggable in Tauri ([15684af](https://github.com/andresmarpz/sandcastle/commit/15684afecc1ca42bdba20d4ffb1b33f0f8931357))
* make mobile sidebar full screen with close button ([a3e21ae](https://github.com/andresmarpz/sandcastle/commit/a3e21ae2a822eb1e5a6ced66fb0c6a26651132c9))
* remove invalid linux section from tauri config ([599ee07](https://github.com/andresmarpz/sandcastle/commit/599ee07483fb7d9c7ec01ffe5f4cfac415f9d3f9))
* remove non-null assertions in petname package ([da554fb](https://github.com/andresmarpz/sandcastle/commit/da554fba1708a1fa570a456bfafd3f3d635bd44d))
* remove non-null assertions in petname package ([f14eda2](https://github.com/andresmarpz/sandcastle/commit/f14eda2fb4b7bb76153bdf418653b2f1396ed78a))
* require Cmd/Ctrl+Enter to send messages, Enter inserts newline ([23f8070](https://github.com/andresmarpz/sandcastle/commit/23f807050bb060dbea6e1e1bedec3142b5893ee3))
* run formatter and lint fix ([8890dc6](https://github.com/andresmarpz/sandcastle/commit/8890dc65206243beac0f99172796423b10375d75))
* **sidebar:** set default width to 265px when expanding from collapsed ([a104cb8](https://github.com/andresmarpz/sandcastle/commit/a104cb8c64fc3fb812d55ecb71008b8573a43886))
* stop production releases if not a release commit ([e97ad3e](https://github.com/andresmarpz/sandcastle/commit/e97ad3efba90af8384f289da5d8fc981f7ad898f))
