# Feature Specification: Giao việc cho thợ ngoài (Antigravity, Muse Code) từ Claude Code

**Ghi chú tên thư mục**: thư mục đặt theo nhà cung cấp đầu tiên khảo sát; phạm vi thẻ đã mở rộng sang nhiều nhà cung cấp.

**Feature Branch**: `010-giao-viec-antigravity`

**Created**: 2026-11-07

**Status**: Đóng — đã hiện thực ở tầng văn phòng (ADR-0022)

**Input**: anh Thắng (07/11/2026): "Nghiên cứu việc claude kết nối cli với anty giao việc sao cho mượt mà" → "Dựng vào repo Zalo-bot, ghi thành một thẻ riêng để nghiên cứu."
· anh Thắng (07/11/2026): "Nghiên cứu luôn cách kết nối với muse AI. Anh cũng muốn trả phí để tuyển bạn ấy về cho em trực tiếp sai việc."

## Bối cảnh

Hạn mức AI là thứ đang chặn tốc độ, không phải ý tưởng. Anh Thắng đang dùng gói Anthropic Ultra
200 USD/tháng mà vẫn hết hạn mức giữa phiên. Hướng xử lý: thuê thêm **thợ ngoài** — Antigravity CLI (`agy`,
gói Google AI Ultra ~100 USD/tháng) và Muse Code của Meta (`muse`, gói từ 5 USD/tháng) — để làm phần
khối lượng lớn. Vai mỗi bên không đổi:

- **Claude Code** giữ vai điều phối: chia việc, viết phiếu giao việc, **chấm bài**, rồi mới báo người.
- **Thợ ngoài** làm phần khối lượng lớn: sửa nhiều tệp, viết test theo mẫu, cào/chuyển dữ liệu, dọn lặp.

Câu hỏi của thẻ này là: nối hai bên bằng đường nào cho **mượt**, và làm sao để lời "xong" của thợ ngoài
**không bao giờ** được tin suông. Hai nhà cung cấp dùng **chung một hợp đồng giao việc**, nên gộp vào một thẻ
thay vì tách — đúng Điều VI (đơn giản). Nguồn: tài liệu chính chủ `antigravity.google/docs` và `dev.meta.ai`,
đọc ngày 07/11/2026.

### Hình dạng đã chọn: một MCP server stdio **tự viết**, một hợp đồng, nhiều nhà cung cấp

Gọi script shell rồi tự bóc JSON là **chưa mượt**: Claude Code phải chạy lệnh, đọc chữ, tự đoán nghĩa.
Hình dạng đúng hơn là **một MCP server stdio nhỏ, tự viết**, khai vào Claude Code, phơi ra **một tool**
`giao_viec_tho` với tham số `nha_cung_cap: "antigravity" | "muse"`.

Bên dưới, server gọi `agy -p --output-format json` hoặc `muse exec --json`. **Cổng chấm bằng hiện vật**
(`git status --porcelain` trong worktree của việc) **dùng chung cho cả hai**. Đây chính là lý do gộp một thẻ:
phần khó và phần phải đúng là cổng chấm, không phải cái binary nào được gọi.

| Đường | Có gì | Vì sao loại / chọn |
|---|---|---|
| **MCP server tự viết, bọc `agy -p --output-format json` và `muse exec --json`** | Claude Code gọi một tool, nhận kết quả đã chấm | **CHỌN.** Mượt cho người điều phối, mà vẫn giữ được cổng chấm bằng hiện vật, và đổi nhà cung cấp chỉ là đổi một tham số |
| `agy -p --output-format json` / `muse exec --json` gọi trực tiếp bằng script | Một lượt, một envelope JSON (Antigravity) hoặc dòng JSONL events (Muse) | Giữ làm **tầng dưới** của MCP server, không phải mặt tiếp xúc với Claude Code |
| `agy acp` | JSON-RPC qua stdio, client duyệt Allow/Deny từng lệnh | Loại: là giao thức cho **editor** (Zed, JetBrains, Android Studio, Xcode). Tài liệu **không nhắc Claude Code**, và **không có kết quả có cấu trúc** — chỉ stream diff cho UI vẽ. (Ghi nhận: có dự án bên thứ ba chạy Antigravity qua ACP stdio — `@ycodium-ai/agent-antigravity` trên npm — nên ACP *dùng được*; mình vẫn chọn headless JSON vì cần kết quả máy đọc được) |
| **Muse Session Protocol (MSP)**: `muse serve` + `muse schema` | Giao thức **chính thức** trên stdio, có JSON schema in ra được; SDK chính chủ `@muse-code/sdk` (TypeScript, npm v1.4.14, maintainer `mjdouglas_meta`, repo github.com/meta-models/muse-code-sdk) và `muse-code-sdk` (Python) | **Hướng nghiên cứu tiếp, không làm vòng đầu.** Đây là điểm Muse **hơn hẳn** Antigravity (Antigravity không có gì tương đương), nhưng dùng SDK là thêm phụ thuộc ⇒ Điều VI. Vòng đầu vẫn `muse exec --json` |
| Remote Control (Antigravity) | Giao diện web điều khiển phiên | Loại: dành cho người bấm, không có API cho chương trình |
| Python SDK `google-antigravity` | Có `response_schema` + `structured_output()` | Loại: **vi phạm Điều VI** (thêm phụ thuộc, lại là Python trong repo Node); và xác thực bằng API key ⇒ tiêu **túi tiền khác** gói Ultra đã mua |

### Antigravity: envelope và các khoá đã tra

`agy -p --output-format json` in một envelope có: `conversation_id`, `status`, `response`, `error`,
`duration_seconds`, `num_turns`, `usage{input_tokens, output_tokens, thinking_tokens, cache_read_tokens, total_tokens}`,
và thêm `structured_output` + `json_schema` khi gọi kèm `--json-schema`.
Giá trị `status`: `SUCCESS`, `ERROR`, `CANCELED`, `INTERRUPTED`, `INVALID`, `WAITING`, `RUNNING`.

Khai quyền ở `~/.gemini/antigravity-cli/settings.json`, khối `permissions` có `allow`/`ask`/`deny`,
xét theo thứ tự **Deny > Ask > Allow**, mỗi phần tử dạng `action(target)`; action có `read_file`,
`write_file`, `read_url`, `execute_url`, `command`, `mcp`, `unsandboxed`. `command` khớp theo **prefix từng từ**,
hoặc `regex:`. Hook ở `.agents/hooks.json` (workspace), sự kiện `PostToolUse`, `matcher` là regex theo tên tool;
tool sửa tệp là `write_to_file`, `replace_file_content`, `multi_replace_file_content`; `timeout` mặc định 30 giây.
Rules: Antigravity đọc `AGENTS.md`, `GEMINI.md`, `.agents/rules/*.md` từ workspace lên tới repo root,
giới hạn 24.000 byte/tệp và 20.000 token cho rule `always_on`.

#### Hai cách xác thực Antigravity tiêu hai túi tiền khác nhau

| Cách | Cấu hình | Tiêu túi nào |
|---|---|---|
| `oauth-personal` | Đăng nhập trình duyệt một lần; tài liệu ghi *"Authenticates personal Free, Pro, and Ultra plans"* | **Hạn mức gói Ultra đã mua** |
| `GEMINI_API_KEY` | `modelProvider: "gemini"` + biến môi trường | **Gemini API trả theo token**, không phải gói Ultra |

Nghịch lý phải biết: Google khuyên dùng API key cho *"headless and CI runs, where no browser is available"* —
tức cách họ khuyên để tự động hoá lại **không dùng gói đã mua**. Chọn `oauth-personal` thì credential nằm trong
keyring hệ điều hành (macOS Keychain / Linux Secret Service + D-Bus / Windows Credential Manager); tài liệu không nêu
đường dẫn tệp. Trên Linux không màn hình, keyring phải sống (`export $(dbus-launch)` + keyring daemon),
nếu không CLI không đọc được credential.

### Bốn điểm đã kiểm chứng về Antigravity — ghi lại để người sau không mắc lại

1. **`agy` KHÔNG phơi ra MCP server.** Tài liệu chính chủ chỉ mô tả Antigravity **tiêu thụ** MCP server
   (nó là client). Trên mạng có nguồn nói "dùng Antigravity CLI làm MCP Server" — **sai**.
   Muốn có MCP thì phải **tự viết server bọc nó**. (Muse Code cũng vậy: là client, không phơi MCP server.)
2. **Gói npm `antigravity-for-claude-code` không tồn tại** — `npm view` trả 404. Đó chỉ là một repo GitHub cá nhân.
3. **`claude_desktop_config.json` là của Claude Desktop**, không phải Claude Code. Claude Code khai MCP server
   qua tệp *.mcp.json* của repo hoặc lệnh `claude mcp add`. Chép sai tệp cấu hình thì server im lặng không được nạp.
4. **Đã có hệ sinh thái bên thứ ba** làm đúng việc này — dùng để **tham khảo code, không cài**:
   `danwahl/antigravity-mcp` (phơi thành một tool duy nhất), `arjunthilakeros/antigravity-claude-mcp`
   (stdio, zero deps), `x51xxx/antigravity-mcp-server` (có giao việc theo git worktree),
   `ganyask12/agy-bridge` (duyệt lệnh + đếm token), `VKirill/antigravity-for-claude-code`.

### Muse Code: sự thật đã tra từ `dev.meta.ai`

Binary `muse`, cài bằng `curl -fsSL https://dev.meta.ai/install.sh | sh`. Mô tả chính chủ:
*"Muse Code is Meta's coding agent for the terminal and CI, built for Muse Spark."*

- **Chế độ không tương tác**: `muse exec --json "<việc>"` → in **JSONL events** ra stdout. Cờ liên quan:
  `--prompt-file`, `--max-model-steps <n>`, `--session-id <uuid>`, `--contributor-mode on|off`,
  `--disable-approval`, `--yolo`. Xuất phiên: `muse export --session <uuid> --out run.json`.
- **Mã thoát CÓ tài liệu hoá** (khác hẳn Antigravity): `0` xong lượt · `1` lỗi hoặc bị huỷ (kể cả khi chạm
  `--max-model-steps`) · `2` lỗi cú pháp dùng · `130`/`143` khi SIGINT/SIGTERM.
- **🔑 Meta tự cảnh báo đúng điều mình đã thiết kế**: *"An agent can finish its turn (exit `0`) and still report
  failing tests"* — và tài liệu bảo phải tự gác bằng lệnh test riêng. Câu này **xác nhận cổng chấm bằng hiện vật
  là đúng**, không phải mình khó tính. Đây là lập luận mạnh cho Điều VII, và nó đến từ chính nhà cung cấp.
- **Không có timeout theo thời gian** — chỉ `--max-model-steps`. Khác Antigravity (`--print-timeout` theo thời gian).
  Hợp đồng tool phải xử lý hai kiểu giới hạn khác nhau này.
- **Không có structured output schema** cho `muse exec` (Antigravity có `--json-schema`). Điểm yếu hơn.
- **MCP**: Muse Code là **client**, không phơi ra MCP server. Cảnh báo chính chủ: *"MCP tools are not sandboxed."*
- **Giao thức chính thức**: Muse Session Protocol (MSP) trên stdio — `muse serve` chạy giao thức, `muse schema`
  in JSON schema của giao thức. Xem bảng đường nối ở trên.
- **Đọc tệp quy tắc — hơn Antigravity**: Muse đọc `AGENTS.md`, `CLAUDE.md`, `.agents/AGENTS.md`,
  `.claude/CLAUDE.md`, đi từ thư mục làm việc lên tới ranh giới `.git`; **mỗi cấp lấy tệp ĐẦU TIÊN tồn tại
  theo thứ tự đó** ⇒ `AGENTS.md` thắng `CLAUDE.md` cùng cấp. Với repo này (có cả hai, `CLAUDE.md` chỉ trỏ sang
  `AGENTS.md`) thì không sao. Với `erp-xnk` (chỉ có `CLAUDE.md`) thì **Muse đọc được ngay, Antigravity thì không**.
- **Worktree — hơn Antigravity**: worktree riêng từng subagent do Muse quản lý, kèm cam kết
  *"It never silently falls back to the shared checkout."* Antigravity không có cam kết này.
- **Song song**: mặc định tối đa **8 agent** mỗi cây, chỉnh `agents.execution_capacity` (1–64) trong
  `~/.config/muse/settings.json`. Có 4 "background observer agents" bật mặc định.
- **Sandbox bật mặc định**: Seatbelt (macOS), bubblewrap (Linux), Windows sandbox. ⚠️ CI trên Linux **cần
  bubblewrap**; thiếu thì **mọi lệnh shell lỗi**. Cảnh báo chính chủ về `--yolo`: *"Never use it on a workstation
  with access to real credentials or infrastructure."*
- **Hook**: `<project-root>/.muse/hooks.json`; sự kiện `PreToolUse`, `PostToolUse`, `PostToolUseFailure`,
  `Stop`, `SessionEnd`. ⚠️ Cảnh báo chính chủ: *"Hooks run outside the sandbox."*
- **Quyền**: không có tệp allow/deny như Antigravity. Có profile (`Ask me`, `Auto-review` mặc định,
  `Unrestricted`, `Read-only`) qua `permissions.default_profile`, cờ `--approval-mode on-request|untrusted|never`,
  và deny rule cho filesystem.
- **Giá (trang sản phẩm chính chủ `dev.meta.ai/products/muse-code/`)**: Everyday **5 USD**/tháng ·
  High **15 USD** · Power **50 USD** · Maximum **200 USD**. ⚠️ Con số 20 USD / 100 USD lan trên blog là của
  **ứng dụng Muse tiêu dùng**, KHÔNG phải Muse Code — đừng lấy số đó mà tính.
  Trả theo dùng, mỗi 1M token: Muse Spark 1,25 USD vào / 4,25 USD ra (cached 0,15 USD);
  Muse Wonder 4,00 USD / 20,00 USD (cached 0,20 USD). **Rate limit theo team, không theo key.**

### 🔴 Hai quả mìn của Muse Code — đọc trước khi trả một đồng nào

**Mìn 1 — TIỀN: `META_API_KEY` GHI ĐÈ đăng nhập.** Tài liệu: *"An API key always takes priority over a
browser sign-in."* Gói thuê bao **chỉ dùng được qua CLI khi đăng nhập trình duyệt**. Nếu biến `META_API_KEY`
có mặt trong môi trường — lọt từ shell profile, từ cấu hình CI, hay từ biến môi trường của tiến trình cha —
thì **mọi lần chạy âm thầm chuyển sang tính theo token**. Nguy hiểm hơn Antigravity, vì đây là ghi đè **có ưu tiên**,
không phải một lựa chọn cấu hình. Hết hạn mức gói thì Muse **không tự chuyển sang token** — phải nâng gói hoặc chờ làm mới.
⇒ Thành FR bắt buộc: server **xoá `META_API_KEY` khỏi môi trường tiến trình con** khi chạy chế độ thuê bao,
và **in ra đang dùng túi tiền nào** trước mỗi lần chạy.

**Mìn 2 — DỮ LIỆU: "Contributor mode" BẬT MẶC ĐỊNH trên gói thuê bao.** Nghĩa là **Meta có thể dùng nội dung
để huấn luyện mô hình**, đổi lấy hạn mức cao hơn. Tắt bằng `--contributor-mode off` hoặc `MUSE_CONTRIBUTOR_MODE=0`.
Giá API chế độ contributor rẻ bất thường (0,10 USD vào / 0,20 USD ra mỗi 1M token, so với 1,25/4,25 USD thường) —
tức là **trả bằng code của mình**. Với repo có dữ liệu khách hoặc logic nghiệp vụ, đây là **lằn ranh cứng**.
⇒ Thành FR bắt buộc: server **luôn truyền `--contributor-mode off`**, và **từ chối chạy** nếu không xác nhận được cờ đó.

### Bảng so sánh hai nhà cung cấp

| Trục | Antigravity (`agy`) | Muse Code (`muse`) |
|---|---|---|
| Giá | Gói Google AI Ultra ~100 USD/tháng (đã mua) | 5 / 15 / 50 / 200 USD/tháng; trả theo dùng 1,25–4,25 USD per 1M token (Spark) |
| Đọc `CLAUDE.md` | **Không** — chỉ `AGENTS.md`, `GEMINI.md`, `.agents/rules/*.md` | **Có** — `AGENTS.md`, `CLAUDE.md`, `.agents/AGENTS.md`, `.claude/CLAUDE.md`, mỗi cấp lấy tệp đầu tiên tồn tại |
| Mã thoát có tài liệu hoá | **Không** đầy đủ; biết chắc: model sai → exit `1`, `/usage` qua stream-json → exit `2` | **Có**: `0` / `1` / `2` / `130` / `143` |
| Cam kết worktree | Không có cam kết; mình phải tự tạo worktree | **Có**: worktree riêng từng subagent, *"never silently falls back to the shared checkout"* |
| Giao thức chính thức | Chỉ ACP (cho editor), không có kết quả có cấu trúc | **MSP** (`muse serve` + `muse schema`) kèm SDK chính chủ TypeScript/Python |
| Giới hạn song song | **Tài liệu không nói** mấy phiên/mấy máy mỗi tài khoản — phải tự đo | **8 agent** mỗi cây mặc định, chỉnh 1–64 qua `agents.execution_capacity` |
| Bẫy tiền | API key tiêu túi khác gói Ultra, nhưng phải tự khai `modelProvider` | **`META_API_KEY` GHI ĐÈ đăng nhập**, âm thầm chuyển sang tính token |
| Bẫy riêng tư | Không thấy chế độ góp dữ liệu | **Contributor mode BẬT MẶC ĐỊNH** trên gói thuê bao |
| Structured output | **Có** `--json-schema` + `structured_output` | **Không** cho `muse exec` |
| Giới hạn một lượt | Theo **thời gian**: `--print-timeout` (mặc định `0s` = vô hạn) | Theo **số bước**: `--max-model-steps`, không có timeout thời gian |
| Sandbox | Có thể **vô hiệu mà không báo** trên Linux chặn unprivileged user namespaces | Bật mặc định; Linux **cần bubblewrap**, thiếu thì mọi lệnh shell lỗi |

**Kết luận bảng: Muse Code mạnh hơn về kỹ thuật, nhưng Contributor mode là lằn ranh phải tắt tường minh.**

### Quyết định kiến trúc: TỰ VIẾT, không cài gói người lạ

Ba lý do, gắn thẳng vào Hiến pháp:

- **Điều IX (bí mật):** MCP server của bên thứ ba thấy **mọi** prompt, mọi đường dẫn, và chạy tiến trình trên máy.
  Đây là rủi ro chuỗi cung ứng, không phải tiện lợi.
- **Điều VII (sai thì dừng):** mình cần cổng chấm bằng **hiện vật** (`git status --porcelain` trong worktree).
  Không gói nào đảm bảo có cổng đó. Chính Meta cũng cảnh báo agent có thể exit `0` mà test vẫn đỏ.
- **Điều VI (đơn giản, không phụ thuộc):** một server stdio MCP chỉ vài chục dòng `node` thuần
  (`node:readline` + `child_process`), rẻ hơn gánh một phụ thuộc. Server là **công cụ dev**,
  không phải dependency runtime — lý do này phải ghi vào `plan.md`.

Kèm theo: **đọc code bốn repo bên thứ ba ở trên để học**, đừng phát minh lại. Đây là một việc nghiên cứu có thật của thẻ này.

### Khớp Hiến pháp (đối chiếu trước)

| Điều | Thợ ngoài tuân thủ thế nào |
|---|---|
| I. Một cửa gửi | Thợ ngoài **không** gửi tin cho khách — nó chỉ sửa tệp trong worktree. Phải **cấm** nó ghi vào `core/gate.js` và `core/gate-decide.js` |
| II. Người trước máy | Không chạm luồng chat, không liên quan |
| III. Số tiền do code tra | Nó sửa gói có `moneyCheck` thì cờ đó phải còn nguyên; cổng kiểm của repo gác |
| IV. Bằng chứng thắng lời khai | **Đúng tinh thần Điều IV:** mỗi lần giao việc ghi envelope JSON / JSONL + stderr vào log; chấm bằng `git diff`, không tin lời thợ. `npm test` vẫn chạy không cần mạng |
| V. Tri thức một nhà | `AGENTS.md` đã giữ luật làm việc của repo; cả hai nhà cung cấp đọc được tệp này nên thừa hưởng, không phải dựng bộ luật thứ hai |
| VI. Đơn giản, không phụ thuộc | **Chỗ phải canh:** không dùng Python SDK của Antigravity, không dùng `@muse-code/sdk` vòng đầu, không cài MCP server của bên thứ ba. Server MCP tự viết bằng `node` thuần (**không `jq`**), dưới 300 dòng. `agy`, `muse` và server là công cụ dev **ngoài đường chạy của bot**, không phải dependency runtime — lý do phải ghi vào `plan.md` |
| VII. Sai thì dừng | **Điều quan trọng nhất ở đây:** Antigravity soft-deny vẫn `exit 0`; Meta tự nói agent có thể exit `0` mà test đỏ. Tin lời thợ là vi phạm Điều VII. Cổng chấm bằng **hiện vật** là cách tuân điều này. Thiếu bubblewrap trên Linux thì **dừng**, không chạy tiếp |
| VIII. Trung thực với khách | Không chạm tin khách |
| IX. Bí mật | Log có thể chứa token ⇒ `.agy-logs/` và `.worktrees/` phải vào `.gitignore`, không commit; `permissions.deny` phải có `write_file(.env)`; **Muse contributor mode phải tắt tường minh** để code không thành dữ liệu huấn luyện; và không giao prompt của mình cho server của người lạ |

**Không cần sửa Hiến pháp.**

## Clarifications

Căn cứ thực tế vận hành văn phòng theo **ADR-0022** (bể thợ Google AI Ultra nhiều tài khoản + trạm kiểm soát dữ liệu + cổng máy, CI và người soát khác model trước khi gộp): 5 câu hỏi trước đây cần làm rõ đã được trả lời chính thức như sau:

1. **Nhà cung cấp và mức gói**:
   - *Câu trả lời*: Chọn **Antigravity**, sử dụng gói **Google AI Ultra** hiện có của văn phòng (hạ tầng bể thợ nhiều tài khoản). Muse Code gác lại, chưa mua.
   - *Căn cứ*: ADR-0022. Gói Google AI Ultra đã có sẵn, đáp ứng tốt nhu cầu giải quyết công việc khối lượng lớn mà không tốn thêm chi phí mua thêm dịch vụ mới.

2. **Hình thức xác thực**:
   - *Câu trả lời*: Xác thực theo **gói thuê bao (oauth / oauth-personal)**, không dùng API key tính theo token (`GEMINI_API_KEY`).
   - *Căn cứ*: ADR-0022. Đảm bảo chi phí cố định theo gói Ultra đã trả trước, không phát sinh chi phí token ngoài ngân sách.

3. **Xử lý khi hết hạn mức gói (`useG1Credits`)**:
   - *Câu trả lời*: Giữ nguyên **`useG1Credits: false`**.
   - *Căn cứ*: ADR-0022. Khi một tài khoản hết hạn mức thì dừng hoặc chuyển tài khoản khác trong bể thợ; tuyệt đối không tự ý bật tiêu credits ngoài gói. Muốn tiêu thêm tiền ngoài gói thì phải hỏi và được CEO duyệt.

4. **Phạm vi repo và vùng mã nguồn được chạm**:
   - *Câu trả lời*: Thợ ngoài được chạm vào các repo theo danh sách cho phép của văn phòng (bao gồm repo `zalo-bot` cho các phần việc khối lượng lớn, độc lập, có tiêu chí rõ ràng). Tuân thủ nghiêm ngặt danh sách repo và vùng cấm / vùng nhạy cảm: **tuyệt đối cấm** thợ ngoài sửa các tệp lõi cửa gửi (`core/gate.js`, `core/gate-decide.js`), các tệp cấu hình bảo mật (`.env*`), hiến pháp (`.specify/`), và cấu hình CI (`.github/`).
   - *Căn cứ*: ADR-0022, Hiến pháp repo (Điều I, Điều IX), và quy tắc thợ văn phòng OZ.

5. **Môi trường / máy chạy**:
   - *Câu trả lời*: Chạy trên **hạ tầng bể thợ của văn phòng** theo kiến trúc ADR-0022 (kết hợp trạm kiểm soát dữ liệu và phân tách môi trường, cổng máy độc lập, CI và người soát khác model trước khi gộp code). Tuân thủ nguyên tắc an toàn: không ghi tên tài khoản, email, địa chỉ máy, IP hay đường dẫn máy chủ vào repo công khai.
   - *Căn cứ*: ADR-0022 và quy tắc bảo mật thông tin nội bộ của văn phòng OZ.

## Việc còn mở (Open Items)

Dù thẻ spec 010 được đóng ở tầng repo vì đã được hiện thực ở tầng hạ tầng văn phòng (ADR-0022), các yêu cầu chức năng (FR) sau đây chưa được phủ trực tiếp trong repo `zalo-bot` và được ghi nhận làm căn cứ để mở thẻ/spec riêng trong tương lai nếu có nhu cầu:

1. **FR-001, FR-002, FR-003, FR-004 (MCP server `scripts/mcp-tho.mjs` tự viết trong repo)**:
   - *Lý do chưa phủ*: Việc điều phối và giao việc cho thợ ngoài được giải quyết trực tiếp tại tầng hạ tầng văn phòng (bể thợ văn phòng bên ngoài container phòng code), không cần duy trì script hay MCP server cục bộ trong mã nguồn `zalo-bot`.
2. **FR-008, FR-009, FR-014 (Các yêu cầu đặc thù cho Muse Code)**:
   - *Lý do chưa phủ*: Văn phòng chưa mua và tạm gác lại việc sử dụng Muse Code (chỉ sử dụng bể thợ Google AI Ultra theo ADR-0022). Nếu sau này văn phòng quyết định mua gói Muse Code, các yêu cầu về biến `META_API_KEY`, `--contributor-mode off` và kiểm tra `bubblewrap` sẽ được mở lại trong thẻ riêng.
3. **FR-015 (Hook tự động `.agents/hooks.json` hoặc `.muse/hooks.json`)**:
   - *Lý do chưa phủ*: Hệ thống kiểm soát hiện tại đã được bảo đảm bằng cổng máy (`npm test`, `npm run eval`, `node scripts/kiem-wiki.mjs`), CI GitHub Actions và quy trình soát chéo chéo model độc lập trước khi gộp PR, không cần cấu hình hook cục bộ trong repo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Giao một việc, nhận kết quả máy đọc được (Priority: P1)

Claude Code gọi **một MCP tool** (`giao_viec_tho`), truyền nội dung việc + slug + `nha_cung_cap`.
Server stdio tự viết chạy `agy -p` hoặc `muse exec` ở chế độ không tương tác, đọc kết quả, chấm bài,
rồi trả về một kết quả **đã chấm** — đạt hay không đạt, vì sao, tệp nào đã đổi, log ở đâu, tiêu túi tiền nào.
Claude Code không phải chạy script rồi tự bóc chữ, và đổi thợ chỉ là đổi một tham số.

**Why this priority**: Không có kết quả máy đọc được thì không có điều phối — chỉ là ba cửa sổ chat cạnh nhau,
đúng thứ đang muốn tránh. Và gọi một tool là định nghĩa của "mượt".

**Independent Test**: Khai server vào Claude Code bằng tệp *.mcp.json* (hoặc `claude mcp add`), gọi `giao_viec_tho`
với một việc nhỏ có thật (ví dụ "thêm một ca test cho `core/text.js`") cho **từng** nhà cung cấp, rồi kiểm kết quả
tool có đủ cờ đạt/không đạt, danh sách tệp đổi, mã thoát, số bước/số giây, số token và đường dẫn log.

**Acceptance Scenarios**:

1. **Given** `nha_cung_cap: "antigravity"` và việc chạy xong bình thường, **When** tool trả về, **Then** kết quả có `dat: true`, `status=SUCCESS`, danh sách tệp đổi khác rỗng, và envelope nguyên văn đã lưu ở `.agy-logs/<mốc>.json`.
2. **Given** `nha_cung_cap: "muse"` và việc chạy xong bình thường, **When** tool trả về, **Then** kết quả có `dat: true`, mã thoát `0`, danh sách tệp đổi khác rỗng, và toàn bộ JSONL events đã lưu vào log.
3. **Given** stdout không đọc được (CLI đổi định dạng, hoặc chết giữa dòng), **When** server đọc, **Then** trả `dat: false` kèm lý do và đường dẫn log — **không** đoán kết quả.
4. **Given** Antigravity trả `status` khác `SUCCESS`, hoặc Muse trả mã thoát `1`/`2`/`130`/`143`, **When** server đọc, **Then** `dat: false`, kèm lý do dịch theo bảng mã thoát của nhà cung cấp đó.
5. **Given** một việc cần kết quả theo khuôn cố định, **When** gọi với `nha_cung_cap: "antigravity"`, **Then** server truyền được `--json-schema` và trả lại `structured_output`; với `"muse"` thì tool MUST nói rõ **không có** structured output, không giả vờ có.
6. **Given** server khai sai chỗ (`claude_desktop_config.json` của Claude Desktop), **When** Claude Code khởi động, **Then** server không được nạp và không có tool nào xuất hiện — đây là lỗi cấu hình đã biết, phải ghi trong hướng dẫn cài.

---

### User Story 2 - Không bao giờ nhận "xong" cho việc chưa làm (Priority: P1)

Cả hai nhà cung cấp đều có đường để báo xong mà chưa xong:

- Antigravity: việc cần duyệt mà headless không xin được thì bị *"soft-denied: the run continues, exits `0`"*.
- Muse Code: chính Meta viết *"An agent can finish its turn (exit `0`) and still report failing tests"*,
  và bảo phải tự gác bằng lệnh test riêng.

Cổng chấm bài trong server phải bắt được cả hai bằng hiện vật.

**Why this priority**: Đây là lỗ hổng chết người của cả thiết kế. Nếu để lọt, GĐ báo người "xong" cho việc chưa làm —
đúng thứ Điều VII cấm. Đây cũng là lý do phải tự viết server thay vì cài gói người lạ.

**Independent Test**: Với Antigravity, cố tình khai `deny` một tool mà việc cần dùng. Với Muse, giao việc kèm
`--max-model-steps` thấp để nó dừng giữa đường. Mong đợi: cổng hiện vật thấy `git status --porcelain` **rỗng**
(hoặc test đỏ) ⇒ tool trả `dat: false` cho cả hai.

**Acceptance Scenarios**:

1. **Given** thợ exit `0` và báo xong, **When** worktree không có tệp nào đổi, **Then** tool trả `dat: false` với lý do "không có hiện vật", và chỉ người đọc log tìm dòng nhắc tool bị chặn.
2. **Given** cả bốn cổng (đọc được kết quả · trạng thái/mã thoát sạch · exit 0 · **có hiện vật**), **When** một cổng đỏ, **Then** cả lượt đỏ; không có cơ chế "tạm cho qua".
3. **Given** stderr có chữ `permission`/`denied`/`allow it`/`warning`, **When** server dò, **Then** chỉ **cảnh báo gợi ý** — tài liệu không công bố định dạng cố định cho các dòng này, nên không được dùng việc grep thành cổng quyết định.
4. **Given** thợ có sửa tệp nhưng `npm test` đỏ, **When** chấm, **Then** `dat: false`: hiện vật là **điều kiện cần**, cổng kiểm của repo là điều kiện đủ (chính Meta cũng nói phải tự gác bằng lệnh test riêng).
5. **Given** việc đúng là "không có gì để sửa" (ví dụ chỉ đọc và trả lời), **When** giao việc loại đó, **Then** người giao phải nói rõ trong phiếu giao việc và dùng `--json-schema` (chỉ Antigravity) để lấy kết quả, chứ không hạ cổng hiện vật.

---

### User Story 3 - Hai thợ chạy song song không tranh chấp (Priority: P1)

Mỗi việc giao đi được cấp một worktree riêng và một nhánh riêng, do **server** tạo — không phụ thuộc nhà cung cấp
có tự quản worktree hay không. Hai thợ không bao giờ sửa cùng một tệp trên cùng một cây làm việc.

**Why this priority**: Lý do thuê thợ ngoài là làm được nhiều việc cùng lúc. Nếu hai thợ ghi đè nhau thì
khối lượng tăng mà kết quả thành rác, và phần dọn còn lâu hơn tự làm.

**Independent Test**: Gọi `giao_viec_tho` hai lần với hai slug khác nhau, gần như cùng lúc, mỗi lần một nhà cung cấp;
kiểm có hai thư mục dưới `.worktrees/` và hai nhánh `agy/<slug>`; `git status` ở cây chính vẫn sạch.

**Acceptance Scenarios**:

1. **Given** một việc mới, **When** server bắt đầu, **Then** tạo `.worktrees/<slug>` trên nhánh `agy/<slug>` từ `HEAD`, và thợ chỉ chạy **bên trong** thư mục đó.
2. **Given** việc đã chấm xong và đã lấy phần cần lấy, **When** dọn, **Then** gỡ worktree bằng `git worktree remove` và giữ lại nhánh cho người đọc diff.
3. **Given** `.worktrees/` và `.agy-logs/`, **When** `git status` ở cây chính, **Then** hai thư mục này không xuất hiện (đã vào `.gitignore`).
4. **Given** cây chính đang ở giữa một việc khác, **When** thợ ngoài chạy, **Then** không thấy và không sửa được tệp đang mở của cây chính.
5. **Given** Muse tự tạo worktree con cho subagent của nó, **When** chấm bài, **Then** cổng hiện vật vẫn chấm trên worktree **của server**; cam kết *"never silently falls back to the shared checkout"* của Muse là điểm cộng, không phải chỗ để bỏ cổng.
6. **Given** hai lượt gọi cùng một slug, **When** lượt sau bắt đầu, **Then** server từ chối thay vì tạo trùng worktree.

---

### User Story 4 - Thợ ngoài không chạm được chỗ nguy hiểm, và không tiêu sai túi tiền (Priority: P2)

Hai nhà cung cấp khai quyền khác nhau, nên server phải áp đúng kiểu cho từng bên:

- **Antigravity**: `~/.gemini/antigravity-cli/settings.json`, `allow` hẹp + `deny` cứng, xét Deny > Ask > Allow.
- **Muse Code**: không có tệp allow/deny; dùng profile `permissions.default_profile` (`Auto-review` là mặc định),
  cờ `--approval-mode on-request|untrusted|never`, và deny rule cho filesystem.

Và với Muse, hai cờ về tiền/dữ liệu phải do **server** áp, không trông vào người gõ tay.

**Why this priority**: Khai `allow` hẹp vừa chặn tai nạn, vừa **giảm soft-deny** (US2). Còn hai quả mìn của Muse
thì sai một lần là mất tiền hoặc mất quyền riêng tư của code — không có đường lui.
P2 vì US1–US3 chạy được trước, nhưng không có mục này thì không được cho thợ chạm repo thật.

**Independent Test**: Giao việc có kèm `git push` và việc có kèm sửa `core/gate.js` cho cả hai thợ: phải bị chặn.
Đặt sẵn `META_API_KEY` trong môi trường rồi chạy Muse chế độ thuê bao: server phải xoá biến đó khỏi tiến trình con
và in ra đang dùng túi tiền nào.

**Acceptance Scenarios**:

1. **Given** `deny` có `command(git push)`, **When** thợ thử đẩy, **Then** bị chặn; việc đẩy là của người, không của máy.
2. **Given** `deny` có `write_file(core/gate.js)` và `write_file(core/gate-decide.js)`, **When** thợ thử sửa cửa gửi, **Then** bị chặn — Điều I.
3. **Given** `deny` có `write_file(.env)`, `write_file(.specify/)`, `write_file(.github/)`, **When** thợ thử sửa, **Then** bị chặn: khoá bí mật, hiến pháp và CI không giao máy ngoài.
4. **Given** `allow` có `command(git)`, **When** thợ chạy `git status && git log`, **Then** chạy không hỏi; nhưng `git log $(whoami)` **vẫn hỏi**, vì `command` khớp theo **prefix từng từ**.
5. **Given** `META_API_KEY` có trong môi trường và chế độ là thuê bao, **When** server chạy `muse`, **Then** biến đó bị **xoá khỏi môi trường tiến trình con** và log ghi rõ đang tiêu gói thuê bao, không phải trả theo token.
6. **Given** mọi lượt Muse, **When** server gọi, **Then** luôn có `--contributor-mode off`; không xác nhận được cờ đó thì **từ chối chạy**.
7. **Given** mọi cấu hình, **When** chạy, **Then** **không bao giờ** dùng `--dangerously-skip-permissions` (Antigravity), `--yolo` hay `--disable-approval` (Muse). Google cảnh báo cờ đầu *"approves all tool calls, including file writes and command execution"*; Meta cảnh báo `--yolo`: *"Never use it on a workstation with access to real credentials or infrastructure."*

---

### User Story 5 - Đo được trước khi dùng thật (Priority: P2)

Trước khi dựng nhiều thợ, chạy một đợt thử nghiệm có số liệu: mấy tiến trình song song thì một tài khoản còn chịu,
hết hạn mức giữa lúc chạy thì thợ trả gì, timeout tool MCP thật của Claude Code là bao nhiêu,
sandbox có thật sự hoạt động trên máy đó không.

**Why this priority**: Hiến pháp Quy trình 4 đòi đo trước khi bật. Và tài liệu **không trả lời** mấy câu trên,
nên chỉ có cách tự đo. P2 vì đo được chỉ sau khi US1–US3 chạy.

**Independent Test**: Một trang ghi số liệu thật (đưa vào `research.md` ở bước `plan`): số tiến trình song song tối đa
mỗi nhà cung cấp, trạng thái/mã thoát khi hết hạn mức, timeout tool MCP đo được, kết quả thử sandbox,
thời gian trung bình một việc, chi phí một việc.

**Acceptance Scenarios**:

1. **Given** 2–3 tiến trình `agy` chạy cùng lúc trên một tài khoản, **When** đo, **Then** ghi lại có bị chặn hay không. Tài liệu Antigravity **không nói** một tài khoản Ultra dùng được mấy máy / mấy phiên song song. (Muse thì nói rõ: 8 agent mỗi cây, chỉnh 1–64.)
2. **Given** hạn mức cạn giữa lúc chạy, **When** đo, **Then** ghi lại trạng thái và mã thoát thật. Antigravity: tài liệu **không nói gì**; chỉ có khoá `useG1Credits` (mặc định `false`) — *"Uses your AI credits for model requests after your plan's quota runs out"* — và không nói khi tắt thì hành xử ra sao. Muse: tài liệu nói **không tự chuyển sang token**, phải nâng gói hoặc chờ làm mới.
3. **Given** ba lớp timeout lồng nhau (xem FR-005), **When** đo, **Then** có con số thật cho timeout tool MCP của Claude Code; tài liệu của cả hai nhà cung cấp **không nói** con số này.
4. **Given** máy chạy là Linux trong container, **When** thử sandbox, **Then** ghi lại kết quả cho cả hai: Antigravity có thể **vô hiệu mà không báo** trên *"Linux hosts and some containers that block unprivileged user namespaces"*; Muse **cần bubblewrap**, thiếu thì mọi lệnh shell lỗi.
5. **Given** cần xem hạn mức còn lại của Antigravity, **When** kiểm, **Then** chạy `agy -p /usage` như một **lệnh riêng**; gửi `/usage` qua `stream-json` sẽ exit `2`.

### Edge Cases

- **Soft-deny vẫn exit 0 (Antigravity)** — tài liệu: *"soft-denied: the run continues, exits `0`"*. **Không có trường JSON nào** báo điều này và **không có chuỗi stderr cố định** để grep (tài liệu chỉ nói có notice *"naming the tool and how to allow it"*). Cổng hiện vật là cách duy nhất đáng tin.
- **Exit 0 mà test đỏ (Muse)** — chính Meta cảnh báo: *"An agent can finish its turn (exit `0`) and still report failing tests"*, và bảo phải tự gác bằng lệnh test riêng.
- **Hai kiểu giới hạn khác nhau** — Antigravity giới hạn theo **thời gian** (`--print-timeout`, mặc định `0s` = vô hạn, ví dụ của Google dùng `10m`/`15m`); Muse giới hạn theo **số bước** (`--max-model-steps`, chạm giới hạn thì exit `1`), **không có** timeout thời gian. Hợp đồng tool phải nhận và kiểm cả hai kiểu.
- **Ba lớp timeout cắt nhau** — đặt sai thứ tự thì lệnh bị cắt cụt giữa chừng mà không rõ lý do: lớp ngoài giết lớp trong trước khi lớp trong kịp báo lỗi tử tế. Xem FR-005.
- **`META_API_KEY` ghi đè đăng nhập (Muse)** — *"An API key always takes priority over a browser sign-in."* Biến lọt vào từ shell profile hay tiến trình cha là đủ để mọi lượt chạy âm thầm chuyển sang tính theo token.
- **Contributor mode bật mặc định (Muse)** — nội dung có thể thành dữ liệu huấn luyện. Giá API chế độ này rẻ bất thường (0,10/0,20 USD mỗi 1M token so với 1,25/4,25 USD) chính là dấu hiệu "trả bằng code của mình".
- **Checkout không tin cậy** — tài liệu cảnh báo trên checkout không tin cậy thì `AGENTS.md` và `CLAUDE.md` của repo **có thể là chỉ dẫn do kẻ tấn công kiểm soát**. `oz-wiki-plhq` là repo công khai nhận PR từ người ngoài ⇒ cho thợ ngoài chạy trên PR của người lạ là mở một đường tiêm chỉ dẫn. Không chạy thợ trên nhánh PR của người ngoài.
- **Hook của Muse chạy NGOÀI sandbox** — *"Hooks run outside the sandbox."* Hook chỉ được chạy cổng kiểm cố định của repo, không bao giờ chạy lệnh do thợ sinh ra.
- **MCP tool của Muse không được sandbox** — *"MCP tools are not sandboxed."* Giữ danh sách MCP server của thợ ở mức tối thiểu.
- **`--mode=auto` tự hạ cấp im lặng (Antigravity)** — nếu auto không khả dụng thì *"prints a warning and continues in `default` mode"* ⇒ việc tưởng chạy tự động lại thành chờ duyệt, rơi vào soft-deny.
- **Keyring chết trên Linux headless (Antigravity)** → CLI không đọc được credential `oauth-personal`; cần D-Bus sống (`export $(dbus-launch)`) và keyring daemon. Rất dễ bị đọc nhầm thành "hết hạn mức".
- **Thiếu bubblewrap trên Linux (Muse)** → mọi lệnh shell lỗi. Server phải kiểm trước và **dừng** với lý do rõ, không để thợ chạy rồi đoán.
- **Rate limit của Muse theo team, không theo key** — thêm người dùng không thêm hạn mức; hai thợ chạy song song ăn cùng một quota.
- **Giá dễ nhầm** — con số 20 USD / 100 USD lan trên blog là của **ứng dụng Muse tiêu dùng**, không phải Muse Code (5 / 15 / 50 / 200 USD).
- **Server MCP khai sai tệp** — Claude Code dùng tệp *.mcp.json* / `claude mcp add`; `claude_desktop_config.json` là của Claude Desktop. Khai sai thì server im lặng không được nạp.
- **Nguồn ngoài nói sai** — có nguồn khẳng định `agy` sẵn là MCP server; đã kiểm chứng là **sai** (tài liệu chỉ mô tả Antigravity *tiêu thụ* MCP; Muse Code cũng vậy). Gói npm `antigravity-for-claude-code` cũng **không tồn tại** (404).
- **Model slug sai (Antigravity)** → headless exit `1`, `status=ERROR`. Điểm này **tốt**: không âm thầm hạ cấp. Slug lấy bằng `agy models`; slug Gemini quan sát được: `gemini-4-argon-high`, `gemini-4-argon-medium`, `gemini-3.8-flash-medium`. **Slug của model Claude không có trong tài liệu.**
- **Mốc 18/11/2026**: Claude Sonnet 4.6, Claude Opus 4.6 và GPT-OSS-120b **bị gỡ khỏi Antigravity**. Thiết kế không được bám vào ba model này.
- **Tên tool gõ sai trong subagent (Antigravity)** — `{workspace}/.agents/agents/{tên}/agent.md` (Markdown + YAML frontmatter; `name`, `description` bắt buộc; `tools`, `model` `inherit|flash|pro`, `commandExecutionPolicy` `off|auto|eager|sandbox`…). Tài liệu cảnh báo: gõ sai tên tool trong `tools` **có thể làm tiến trình subagent treo**. Để `tools` rỗng khi chưa chắc.
- **`permissions` của Antigravity chỉ được tài liệu mô tả ở mức global**; **không rõ** có khai theo workspace được không. Hệ quả: một máy chỉ có một bộ luật, nên bộ luật phải đủ hẹp cho repo nhạy cảm nhất đang chạy trên máy đó.
- **Luật nhà hiện viết cho Claude Code** — Antigravity đọc `AGENTS.md`, `GEMINI.md`, `.agents/rules/*.md` (24.000 byte/tệp, tổng 20.000 token cho rule `always_on`). Repo này **đã có `AGENTS.md`** ⇒ lợi thế lớn, thợ ngoài đọc được luật nhà ngay. Nhưng `AGENTS.md` hiện tại viết cho Claude Code (nhắc spec-kit, Superpowers, skill `/speckit-*`) — phần đó vô nghĩa với thợ ngoài. Khoảng lệch này phải được ghi nhận và vá ở bước `plan`.
- **Hook Antigravity quá giờ** — `.agents/hooks.json`, `timeout` mặc định **30 giây**; cổng kiểm của repo có thể lâu hơn ⇒ đặt dư.
- **Log chứa bí mật** — envelope, JSONL events và stderr có thể mang token hoặc đường dẫn nội bộ. Không commit, và che trước khi dán vào báo cáo.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Mặt tiếp xúc với Claude Code MUST là một **MCP server stdio tự viết** (`scripts/mcp-tho.mjs`, theo lệ `scripts/*.mjs` của repo), viết bằng `node` thuần (`node:readline` + `child_process`), MUST NOT thêm dependency, MUST NOT dùng `jq` hay công cụ ngoài nào khác ngoài `git` và binary của thợ, và MUST dưới 300 dòng (Điều VI).
- **FR-002**: Server MUST được khai vào Claude Code bằng tệp *.mcp.json* của repo hoặc lệnh `claude mcp add`. Hướng dẫn cài MUST nói rõ **không** dùng `claude_desktop_config.json` (tệp đó của Claude Desktop).
- **FR-003**: Hợp đồng tool `giao_viec_tho` MUST cố định và MUST dùng chung cho mọi nhà cung cấp: **vào** `{viec, slug, nha_cung_cap: "antigravity" | "muse", gioi_han?, model?, json_schema?, hien_vat_mong_doi?}`; **ra** `{dat, ly_do, nha_cung_cap, tui_tien, tep_doi[], nhanh, worktree, duong_dan_log, ma_thoat, status?, duration_seconds?, num_turns?, so_buoc?, usage?, structured_output?}`. Trường `dat` MUST là kết luận của cổng chấm, không phải lời thợ nói về chính nó.
- **FR-004**: Tầng dưới MUST là `agy -p "<việc>" --output-format json` (Antigravity) hoặc `muse exec --json "<việc>"` (Muse), chạy trong worktree của việc. MUST NOT dùng ACP, Remote Control, Python SDK `google-antigravity`, hay `@muse-code/sdk` trong vòng đầu. MSP (`muse serve` + `muse schema`) được ghi là **hướng nghiên cứu tiếp**, không làm vòng này.
- **FR-005**: Ba lớp timeout MUST lồng nhau theo đúng thứ tự: giới hạn của thợ **<** timeout nội bộ của MCP server **<** timeout tool MCP của Claude Code. Giới hạn của thợ MUST tường minh theo đúng kiểu của từng bên: Antigravity `--print-timeout` theo **thời gian** (mặc định tài liệu là `0s` = vô hạn; giá trị mặc định của server MUST nằm trong khoảng ví dụ của Google `10m`–`15m`), Muse `--max-model-steps` theo **số bước** (vì Muse không có timeout thời gian). Timeout tool MCP thật của Claude Code MUST được **đo** rồi ghi vào `research.md`.
- **FR-006**: Server MUST chấm bài bằng **bốn cổng**, đỏ một cổng là đỏ cả lượt: (1) đọc được kết quả của thợ (envelope JSON hoặc JSONL events); (2) trạng thái sạch — Antigravity `status === "SUCCESS"`, Muse mã thoát `0` (không phải `1`/`2`/`130`/`143`); (3) mã thoát tiến trình bằng 0; (4) **hiện vật**: `git status --porcelain` trong worktree **không rỗng**. Cổng (4) là **cổng quyết định** — ba cổng kia đều có thể xanh khi việc chưa làm.
- **FR-007**: Server MUST NOT trả `dat: true` khi cổng hiện vật rỗng. Mã thoát 0 MUST NOT được coi là bằng chứng việc đã làm — Antigravity soft-deny vẫn exit `0`, và chính Meta nói agent có thể exit `0` mà test vẫn đỏ. Việc grep stderr MUST NOT là cổng quyết định; dò stderr chỉ được trả về như **gợi ý** cho người đọc.
- **FR-008**: Khi `nha_cung_cap: "muse"`, server MUST **xoá `META_API_KEY` khỏi môi trường tiến trình con** trong chế độ thuê bao (API key *"always takes priority over a browser sign-in"*), và MUST in / trả về **đang tiêu túi tiền nào** trước mỗi lần chạy. Không xác định được túi tiền thì MUST từ chối chạy.
- **FR-009**: Khi `nha_cung_cap: "muse"`, server MUST luôn truyền `--contributor-mode off` (hoặc `MUSE_CONTRIBUTOR_MODE=0`) và MUST **từ chối chạy** nếu không xác nhận được cờ đó đã có hiệu lực. Contributor mode bật mặc định trên gói thuê bao nghĩa là nội dung có thể thành dữ liệu huấn luyện — Điều IX.
- **FR-010**: Server MUST NOT dùng `--dangerously-skip-permissions` (Antigravity), `--yolo` hay `--disable-approval` (Muse), ở mọi chế độ, kể cả khi việc gấp.
- **FR-011**: Khai quyền Antigravity MUST được đặt trước ở `~/.gemini/antigravity-cli/settings.json` theo thứ tự **Deny > Ask > Allow**: `allow` hẹp cho việc thường ngày (`command(git)`, `command(node)`, `command(regex:npm (test|run eval))`, `write_file(packs/)`, `write_file(test/)`, `write_file(eval/)`, `write_file(docs/)`); `ask` cho phần còn lại (`command(*)`, `mcp(*)`).
- **FR-012**: `deny` của Antigravity MUST có tối thiểu: `command(git push)`, `write_file(core/gate.js)`, `write_file(core/gate-decide.js)`, `write_file(.env)`, `write_file(.specify/)`, `write_file(.github/)`, `command(sudo)`, `command(rm -rf)`, `command(regex:curl .*)`. Với Muse — không có tệp allow/deny — server MUST dùng profile hạn chế (`permissions.default_profile` không phải `Unrestricted`), `--approval-mode` không phải `never`, và deny rule filesystem phủ cùng danh sách trên. Lý do từng dòng MUST được ghi vào `plan.md`, không khai suông.
- **FR-013**: Mỗi việc giao đi MUST chạy trong **worktree riêng** `.worktrees/<slug>` trên nhánh `agy/<slug>` tạo từ `HEAD`, do **server** tạo, không trông vào thợ tự quản worktree; thợ MUST được chạy với thư mục làm việc là worktree đó, không bao giờ là cây chính. Slug trùng MUST bị từ chối.
- **FR-014**: Trước khi chạy Muse trên Linux, server MUST kiểm có bubblewrap; thiếu thì MUST dừng với lý do rõ (Điều VII), MUST NOT chạy tiếp rồi đoán nguyên nhân mọi lệnh shell lỗi.
- **FR-015**: Hook MUST chỉ chạy **cổng kiểm cố định của repo**, không bao giờ chạy lệnh do thợ sinh ra: Antigravity `.agents/hooks.json` sự kiện `PostToolUse`, `matcher` phủ `write_to_file|replace_file_content|multi_replace_file_content`, `timeout` đặt dư hơn mặc định 30 giây; Muse `<project-root>/.muse/hooks.json` — và hook của Muse **chạy ngoài sandbox**, nên nội dung hook phải là lệnh cố định của repo.
- **FR-016**: `.agy-logs/` và `.worktrees/` MUST được thêm vào `.gitignore`. Kết quả thô của thợ và stderr MUST được lưu vào `.agy-logs/<mốc>.json`/`.jsonl` và `.agy-logs/<mốc>.stderr`, và MUST được **che bí mật** (dùng lại `core/redact.js`) trước khi trả về qua MCP hay dán vào báo cáo — Điều IX.
- **FR-017**: Xác thực MUST là đăng nhập gói thuê bao: Antigravity `oauth-personal` (MUST NOT dùng `GEMINI_API_KEY`), Muse đăng nhập trình duyệt (MUST NOT dựa vào `META_API_KEY`). `useG1Credits` của Antigravity MUST để `false` cho tới khi hành vi hết hạn mức được đo xong (US5).
- **FR-018**: `npm test`, `npm run eval` và `node scripts/kiem-wiki.mjs` MUST xanh trước khi gộp **bất cứ thứ gì** thợ ngoài viết; đầu ra của hai lệnh đầu MUST kèm theo khi báo "xong" (theo `AGENTS.md`).
- **FR-019**: Thợ ngoài MUST NOT tự `git push`, mở PR hay gộp nhánh. Việc đẩy và gộp là của người; thợ chỉ để lại nhánh và diff.
- **FR-020**: Thợ ngoài MUST NOT được chạy trên checkout không tin cậy (nhánh PR của người ngoài, ví dụ ở `oz-wiki-plhq`): trên đó `AGENTS.md`/`CLAUDE.md` có thể là chỉ dẫn do kẻ tấn công kiểm soát.
- **FR-021**: Mỗi lượt giao việc MUST ghi vào log đủ: nhà cung cấp, túi tiền, mã thoát, trạng thái (Antigravity) hoặc số bước (Muse), thời gian, và số token nếu nhà cung cấp trả về — để đo chi phí và độ trễ về sau (Điều IV).
- **FR-022**: Model MUST được chọn bằng slug thật (Antigravity: `agy models`), đọc qua biến môi trường hoặc tham số tool, MUST NOT hardcode trong server; MUST NOT bám vào Claude Sonnet 4.6, Claude Opus 4.6 hay GPT-OSS-120b (bị gỡ khỏi Antigravity từ **18/11/2026**).
- **FR-023**: Luật cô đặc cho thợ ngoài MUST nằm trong `AGENTS.md` (hoặc `.agents/rules/*.md` nếu dài), trong giới hạn 24.000 byte/tệp và 20.000 token cho rule `always_on`, và MUST nêu rõ: chỉ `core/gate.js` được gửi tin (Điều I), không thêm dependency (Điều VI), không báo "xong" cho việc chưa làm (Điều VII).
- **FR-024**: MUST NOT cài MCP server của bên thứ ba. Trước khi viết server, bước `plan` MUST **đọc code** của `danwahl/antigravity-mcp`, `arjunthilakeros/antigravity-claude-mcp`, `x51xxx/antigravity-mcp-server` và `ganyask12/agy-bridge` để học, và ghi vào `research.md` những gì lấy lại được.
- **FR-025**: Phiếu giao việc MUST nói rõ **hiện vật mong đợi** (tệp nào đổi, test nào xanh) để cổng (4) chấm được; việc không sinh hiện vật MUST dùng `--json-schema` (chỉ Antigravity có) và MUST NOT hạ cổng hiện vật.

### Key Entities

- **Phiếu giao việc (Job card)**: nội dung việc + hiện vật mong đợi + nhà cung cấp + giới hạn (slug, worktree, thời gian hoặc số bước, model).
- **Hợp đồng tool (Tool contract)**: tham số vào và kết quả ra của `giao_viec_tho` theo FR-003, dùng chung cho mọi nhà cung cấp.
- **Bộ chuyển nhà cung cấp (Provider adapter)**: phần dịch hợp đồng chung sang cờ dòng lệnh và cách đọc kết quả của `agy` hoặc `muse`.
- **Túi tiền (Billing bucket)**: gói thuê bao hay trả theo token — phải xác định được **trước** mỗi lần chạy.
- **Biên bản chạy (Run log)**: `{kết quả thô, stderr, mốc thời gian, nhà cung cấp, túi tiền, nhánh, worktree}` trong `.agy-logs/`, đã che bí mật.
- **Cổng chấm bài (Grading gates)**: bốn cổng của FR-006, trong đó cổng hiện vật là cổng quyết định.
- **Khai quyền (Permission policy)**: Antigravity `allow`/`ask`/`deny` (Deny > Ask > Allow); Muse profile + `--approval-mode` + deny rule filesystem.
- **Worktree việc (Task worktree)**: `.worktrees/<slug>` + nhánh `agy/<slug>`, một việc một cây.

## Success Criteria *(mandatory)*

- **SC-001**: **0** lần gộp code do thợ ngoài viết mà `npm test` đỏ (quét lịch sử nhánh `agy/*` và log CI).
- **SC-002**: **0** lần tool trả `dat: true` khi cổng hiện vật rỗng — quét `.agy-logs/`: mọi lượt "đạt" đều kèm danh sách tệp đổi khác rỗng.
- **SC-003**: **0** lượt chạy Muse mà môi trường tiến trình con còn `META_API_KEY` trong chế độ thuê bao, và **100 %** lượt log ghi rõ túi tiền đã tiêu.
- **SC-004**: **0** lượt chạy Muse mà không có `--contributor-mode off` có hiệu lực (quét log của mọi lượt).
- **SC-005**: **0** token, khoá hay đường dẫn nội bộ lọt vào tệp được commit — `git ls-files` không có `.agy-logs/` hay `.worktrees/`, và cổng quét bí mật của repo xanh.
- **SC-006**: **100 %** lượt giao việc có đủ tệp kết quả thô và tệp `.stderr` trong `.agy-logs/`, mỗi lượt ghi đủ nhà cung cấp, túi tiền, mã thoát và giới hạn đã dùng.
- **SC-007**: **0** lần thợ ngoài sửa được `core/gate.js`, `core/gate-decide.js`, `.env`, `.specify/` hay `.github/` (quét `git diff --name-only main...agy/*` của mọi nhánh thợ).
- **SC-008**: Có **số liệu thật** cho số tiến trình song song tối đa mỗi nhà cung cấp và cho hành vi hết hạn mức giữa lúc chạy, ghi vào `research.md`, trước khi dựng quá hai thợ chạy song song.
- **SC-009**: **0** lượt bị cắt cụt vì timeout đặt sai thứ tự — ba lớp giới hạn của FR-005 có số đo thật và xếp đúng thứ tự tăng dần, ghi vào `research.md`.
- **SC-010**: **0** dependency mới trong `package.json` sau khi thẻ này được làm xong, **0** MCP server của bên thứ ba được cài, và **0** lượt thợ chạy trên nhánh PR của người ngoài.

## Assumptions

- `agy` và `muse` là **công cụ dev ngoài repo**, cài trên máy người; MCP server bọc chúng cũng là công cụ dev, không nằm trong đường chạy của bot ⇒ không phá Điều VI. Lý do này phải ghi lại trong `plan.md`.
- Repo này đã có `AGENTS.md` ở gốc nên cả hai nhà cung cấp đọc được luật nhà ngay; phần viết riêng cho Claude Code (spec-kit, Superpowers) chỉ là nhiễu, không phải xung đột. `CLAUDE.md` của repo chỉ trỏ sang `AGENTS.md`, nên luật đọc tệp của Muse (`AGENTS.md` thắng `CLAUDE.md` cùng cấp) không gây lệch.
- Server MCP không nằm trong đường chạy của bot ⇒ không cần test đỏ trước theo nghĩa của Điều IV; nhưng vẫn phải qua `node scripts/kiem-wiki.mjs` và không làm đỏ `npm test`.
- Tài liệu `antigravity.google/docs` và `dev.meta.ai` đọc ngày 07/11/2026 là nguồn duy nhất cho mọi con số và tên khoá trong thẻ này. Chỗ nào tài liệu không nói, thẻ ghi rõ "tài liệu không nói" và chuyển sang mục phải tự đo (US5).
- Bốn repo bên thứ ba ở mục Bối cảnh chỉ để **đọc học**; không cài, không phụ thuộc, nên chúng có đổi hay biến mất cũng không ảnh hưởng thiết kế.
- ~~[NEEDS CLARIFICATION: Chọn nhà cung cấp nào trước, và mức gói nào? Antigravity ~100 USD (đã có Google AI Ultra) hay Muse Code 15 USD High / 50 USD Power? Đề xuất: thử Muse Code mức 15 USD trên `zalo-bot` trước vì nó đọc được `CLAUDE.md`, mã thoát rõ ràng, và có cam kết worktree — nhưng BẮT BUỘC tắt contributor mode.]~~ → **Đã giải quyết theo ADR-0022**: Chọn Antigravity với gói Google AI Ultra hiện có của văn phòng (hạ tầng bể thợ nhiều tài khoản); Muse Code gác lại, chưa mua (chi tiết tại mục Clarifications).
- ~~[NEEDS CLARIFICATION: Xác thực `oauth-personal` (tiêu hạn mức gói Ultra ~100 USD đã mua) hay `GEMINI_API_KEY` (Gemini API trả theo token)? Hai cách tiêu hai túi tiền khác nhau. Đề xuất: `oauth-personal`.]~~ → **Đã giải quyết theo ADR-0022**: Xác thực theo gói thuê bao (oauth / oauth-personal), không dùng API key tính theo token (chi tiết tại mục Clarifications).
- ~~[NEEDS CLARIFICATION: Khi hạn mức Ultra cạn giữa việc — bật `useG1Credits` (tự tiêu thêm AI credits) hay để `false` và dừng? Đề xuất: `false` cho tới khi đo xong hành vi.]~~ → **Đã giải quyết theo ADR-0022**: Giữ `useG1Credits: false`; khi hết hạn mức tài khoản thì dừng hoặc đổi thợ trong bể, muốn tiêu thêm tiền ngoài gói phải hỏi và được CEO duyệt (chi tiết tại mục Clarifications).
- ~~[NEEDS CLARIFICATION: Cho thợ ngoài chạm những repo nào? Đề xuất: `zalo-bot` và `oz-wiki-plhq` trước; `erp-xnk` chỉ sau khi chạy ổn, vì repo đó gộp vào `develop` là ra khách ngay. Riêng `oz-wiki-plhq`: chỉ nhánh của mình, không chạy trên PR của người ngoài.]~~ → **Đã giải quyết theo ADR-0022**: Thợ ngoài được chạm vào các repo theo danh sách cho phép của văn phòng (bao gồm `zalo-bot` cho việc khối lượng lớn, rõ ràng); tuyệt đối cấm chạm vùng nhạy cảm (`core/gate.js`, `core/gate-decide.js`, `.env*`, `.specify/`, `.github/`) (chi tiết tại mục Clarifications).
- ~~[NEEDS CLARIFICATION: Máy nào chạy thợ ngoài — máy anh Thắng (có màn hình, đăng nhập dễ), VPS 201, hay máy chủ Dell của văn phòng? Linux không màn hình cần D-Bus + keyring sống cho Antigravity, và cần bubblewrap cho Muse. Tài liệu Antigravity không nói một tài khoản Ultra dùng được mấy máy / mấy phiên song song; Muse giới hạn theo team, không theo key.]~~ → **Đã giải quyết theo ADR-0022**: Chạy trên hạ tầng bể thợ của văn phòng, kết hợp trạm kiểm soát dữ liệu, cổng máy và CI trước khi gộp; không ghi thông tin IP/máy nội bộ lên repo công khai (chi tiết tại mục Clarifications).

## Không làm (và lý do)

- **Không bao giờ chạy contributor mode trên repo có dữ liệu khách hay logic nghiệp vụ**: nội dung thành dữ liệu huấn luyện của Meta — Điều IX. Giá API chế độ đó rẻ bất thường vì mình trả bằng code của mình.
- **Không để `META_API_KEY` tồn tại trong môi trường khi chạy chế độ thuê bao**: API key *luôn* thắng đăng nhập trình duyệt, nên một biến lọt vào là âm thầm đổi túi tiền.
- **Không cài MCP server của bên thứ ba**: nó thấy mọi prompt, mọi đường dẫn và chạy tiến trình trên máy (Điều IX), lại không đảm bảo có cổng chấm bằng hiện vật mà Hiến pháp đòi (Điều VII). Đọc code của họ để học thì có; cài thì không.
- **Không tin nguồn nói `agy` sẵn là MCP server**: đã kiểm chứng là **sai** — tài liệu chính chủ chỉ mô tả Antigravity *tiêu thụ* MCP server, Muse Code cũng vậy. Gói npm `antigravity-for-claude-code` cũng không tồn tại (404).
- **Không dùng SDK của nhà cung cấp trong vòng đầu** (`google-antigravity` của Python, `@muse-code/sdk` của TypeScript): thêm phụ thuộc — Điều VI. MSP của Muse là hướng nghiên cứu tiếp, không phải vòng này.
- **Không dùng ACP (`agy acp`)**: là giao thức cho editor, tài liệu không nhắc Claude Code, và **không trả kết quả có cấu trúc** — chỉ stream diff cho UI vẽ. (ACP *dùng được*: có dự án bên thứ ba chạy Antigravity qua ACP stdio. Nhưng điều phối cần kết quả máy đọc được, nên vẫn chọn headless JSON.)
- **Không dùng `--dangerously-skip-permissions`, `--yolo`, `--disable-approval`**: chúng duyệt sẵn mọi lệnh gọi tool, kể cả ghi tệp và chạy lệnh. Meta nói thẳng về `--yolo`: *"Never use it on a workstation with access to real credentials or infrastructure."*
- **Không cho thợ ngoài tự `git push` hay gộp nhánh**: đẩy và gộp là quyết định của người. Thợ để lại nhánh và diff.
- **Không cho thợ ngoài sửa `core/gate.js` / `core/gate-decide.js`**: Điều I là NON-NEGOTIABLE, một cửa gửi duy nhất. Vùng này do người sửa và người review.
- **Không chạy thợ ngoài trên checkout không tin cậy** (nhánh PR của người ngoài): `AGENTS.md`/`CLAUDE.md` ở đó có thể là chỉ dẫn do kẻ tấn công kiểm soát.
- **Không tin mã thoát 0**: Antigravity soft-deny vẫn exit 0; chính Meta nói agent có thể exit 0 mà test đỏ. Chấm bằng hiện vật, không chấm bằng lời khai — Điều IV và Điều VII.
- **Không dựng subagent Antigravity trong đợt đầu**: tài liệu cảnh báo tên tool gõ sai trong `tools` có thể làm tiến trình treo. Làm sau, khi đường cơ bản đã chạy đủ một tuần.
