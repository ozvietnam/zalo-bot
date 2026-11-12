# Nhật ký wiki

> Cập nhật: 2026-11-12 · commit: b4d5ca9

Nhật ký thay đổi của bộ wiki trong docs/wiki. Mỗi dòng ghi: ngày, commit của mã nguồn
đã đọc khi viết, và những trang bị thay đổi hoặc thêm mới.

Quy ước:

- Thêm mục mới **trên đầu** danh sách (mới nhất ở trên).
- Ghi rõ **vì sao** đổi, không chỉ ghi "sửa lỗi".
- Khi trích dẫn trong wiki không còn khớp code, ghi lại ở mục "Cần sửa lại" của trang đó
  và sửa khi có đợt cập nhật tiếp theo.

## 2026-11-12 — OZV-496: bot không im khi Cổng chậm — "đang tra" ≤ 3 giây + câu tạm khi hết 120 giây chờ Cổng

- **Commit mã nguồn đã đọc:** `cf49b45` (nhánh `ozv-430-don-no-packs-hs` là main hiện tại lúc bắt đầu; làm trên worktree riêng, nhánh `ozv-496-bot-khong-im-khi-cong-cham`).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (dòng OZV-496 mới, ghi số đo thật 12/11), `docs/wiki/an-toan.md` (số dòng `core/engine.js` 340 → 341 sau khi thêm 1 dòng ở OZV-496), `docs/wiki/log.md`.
- **Vì sao:** đo thật 12/11 trên Cổng OZ thật phát hiện hai lỗi làm bot im:
  1. **"đang tra" về muộn** — não Gemini chậm 5–9 giây TRƯỚC lần gọi Cổng đầu tiên; `qa-that` chạy thật đo 9,3 s / 5,9 s / 5,4 s, vượt mốc ≤ 3 giây của issue #168. G4 (giọng Quyên) bước 1→2 và G5 trượt vì lý do này; `qa-that` thật đạt **4/6 ĐẠT**.
  2. **Cổng treo quá 120 giây thì bot im toàn lượt** — đã báo "đang tra" rồi mà lượt không xong, khách bị bỏ.
  Sửa trong lượt (không đụng hàng đợi ưu tiên spec 008 — đã tra, `gateway/` là Cổng AI Studio, không nằm trên đường phân loại mã): bọc thêm `brain.hieu`/`editor.chot` để "đang tra" bắn ngay khi đợi não; thêm câu tạm `congCham` sau `CAU_TAM_SAU_MS = 120_000`; cửa gửi bước 6 bỏ so chữ khuôn cho tin `progress` (đảo luật sự cố #9 — câu "đang tra" của câu khách MỚI không còn bị bỏ `similar:1.00`).
  Số đo kèm theo lần đo 12/11: bộ 50 ca dựng từ văn bản pháp luật — top-1 **66 %**, top-3 **80 %**, 7 ca không ra mã.
- **Kiểm tra:** `npm test` xanh, `npm run eval` 32/32, `node scripts/qa-that.mjs --mock` 6/6, `node scripts/kiem-wiki.mjs --nghiem` ĐẠT.

## 2026-11-12 — OZV-489 / OZV-430 điểm 1 (vòng soát 5): bỏ alias XK→HK và VD→VN khỏi bảng ALIAS

- **Commit mã nguồn đã đọc:** `e27d52e` (bản vá vòng 4 đã commit trên nhánh `ozv-430-don-no-packs-hs`), đối chứng `origin/main` = `d776735`.
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (dòng OZV-430 điểm 1: vòng soát 5), `docs/wiki/an-toan.md` (số dòng `packs/hs/input.js` 349 → 355), `docs/wiki/log.md`.
- **Vì sao:** giám đốc soát vòng 4 của PR #214 CHẶN 2 dòng alias còn lại trong bảng `ALIAS`
  (`XK → HK`, `VD → VN`) — không phải phỏng đoán, đã tra MCP sourcebot repo `hs-code-api`:
  - **`XK` không phải nước.** Ở Cổng OZ, `XK` là BIỂU THUẾ XUẤT KHẨU (tệp customs-types.js trong
    thư mục `lib` của repo đó dòng 20 dùng `XK` làm chiều xuất khẩu; tệp README.md trong thư mục
    `data/bieu-thue` của repo đó — sheet `XK` = "Biểu thuế xuất khẩu", `EV-XK`/`UKV-XK`/`CPTPP-XK`
    = "Biểu XK ưu đãi theo hiệp định"). Hồng Kông là `HK` (tệp iso-3166-vn.json trong thư mục `data`
    của repo đó dòng 18) và KHÔNG thuộc FTA nào (tệp fta.js trong thư mục `lib` của repo đó dòng 30-48)
    ⇒ `XK → HK` không đổi mức thuế, chỉ khai một nước khách chưa nói.
  - **`VD` không có trong danh mục Cổng** (`grep '"VD"'` toàn repo `hs-code-api` không ra) và không
    phải mã ISO ⇒ `VD → VN` là bịa nước.
- **Vá thế nào (một commit):**
  1. `packs/hs/input.js`: `ALIAS = { UK: 'GB', ANH: 'GB' }`; chú giải ngay trên bảng ghi rõ VÌ SAO
     KHÔNG map XK/VD (dẫn chứng tệp như trên) và hai mã này rơi về giả định có nói của `xuatXuCua`
     (`{ ma: XUAT_XU_MAC_DINH, giaDinh: true }`) — bot vẫn tra được nhưng nói rõ giả định (Điều VIII).
  2. `packs/hs/test/xuat-xu-ma-nuoc-vong-4.test.mjs` nhóm C: `countryCode('XK'/'VD')` ⇒ `null`,
     thêm ràng `!('XK' in ALIAS) && !('VD' in ALIAS)`, thêm `xuatXuCua({ nhan: 'XK'/'VD' })` ⇒
     `{ ma: 'CN', giaDinh: true }`; GIỮ nguyên ca Hồng Kông thật (`HK`, `Hong Kong`, `Hồng Kông` ⇒ `HK`).
     Đỏ trước, xanh sau. Không đụng nhóm A/B/D.
  3. `docs/wiki/an-toan.md`: input.js 349 → 355 dòng (test wiki-no-lon-dong đỏ trước khi sửa số).
- **Bốn cổng trên commit vá:** `npm test` 1289/1289, `npm run eval` 32/32,
  `node scripts/qa-that.mjs --mock` 6/6, `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).



- **Commit mã nguồn đã đọc:** `a7988ff` (nhánh `ozv-430-don-no-packs-hs`), đối chứng `origin/main` = `d776735`.
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (dòng OZV-430 điểm 1), `docs/wiki/an-toan.md`
  (thêm `packs/hs/input.js` vào danh sách tệp vượt 300 dòng — 293 → 349 dòng), `docs/wiki/log.md`.
- **Vì sao:** giám đốc chặn PR #214 lần ba với bốn nhóm lỗi còn lại. Vòng 3 vá được ô CÓ NHÃN,
  nhưng bộ dựng mã trong CÂU TỰ DO vẫn dùng regex ASCII `[A-Z]{2}` + ranh giới `[^A-Za-z0-9]`,
  nên chữ có dấu bị CẮT mảnh và phần còn lại đọc thành mã ISO **thật**:

  | câu khách gõ | mã bot gửi Cổng (vòng 3) | đúng ra | mã ISO bị đọc nhầm |
  | --- | --- | --- | --- |
  | `hàng VIỆT NAM` | `VI` | `VN` | Virgin Islands |
  | `hàng MỸ` (dạng NFD) | `MY` | `US` | Malaysia |
  | `hàng ĐỒNG` | `NG` | không có nước | Nigeria |
  | `hàng GHẾ` | `GH` | không có nước | Ghana |
  | `CÀ PHÊ` | `PH` | không có nước | Philippines |

  Gửi mã sai ⇒ Cổng không khớp dòng FTA nào nên ưu đãi C/O mẫu E rụng, khách đọc mức thuế cao
  hơn thật mà tưởng đã tra đúng (Điều III), và mã này đi thẳng vào `sinh_mo_ta_khai_bao` tức
  in lên MÔ TẢ KHAI BÁO khách dán vào tờ khai (Điều VIII).
- **Vá thế nào (một commit, bốn nhóm):**
  1. **A — bộ dựng mã hiểu chữ Unicode.** `tachTu` (`packs/hs/input.js:189`) tách "từ" theo
     `[\p{L}\p{N}][\p{L}\p{N}\p{M}]*` nên "VIỆT" là MỘT từ; từ có dấu (`\p{M}`) không phải mã ISO.
     `maNuocTrongCau` (`packs/hs/input.js:207`) và `findCountryInText` (`packs/hs/input.js:272`)
     dùng chung hàm này — trước đó hai bên lệch nhau: `findCountryInText` tách bằng
     `[\p{L}\p{N}]+` nên dấu rời (NFD) bị RƠI và "Mỹ" lại thành "my".
  2. **B — Anh = `GB`.** Cổng OZ so ISO alpha-2 — ở repo **hs-code-api**: tệp iso-3166-vn.json
     trong thư mục `data` dòng 16 (`GB`) và tệp fta.js trong thư mục `lib` dòng 43
     (`ukvfta.thanhVien = ['VN','GB']`). "UK" không phải mã nước nào — gửi "UK" thì Cổng báo
     mã quốc gia không có trong danh mục ISO (tệp declaration-validator.js trong thư mục `lib`
     dòng 368) và không khớp ưu đãi (tệp fta.js trong thư mục `lib` dòng 81).
  3. **C — Hồng Kông = `HK`.** Tệp iso-3166-vn.json trong thư mục `data` dòng 18 của repo đó.
     **"XK" KHÔNG phải Hồng Kông**: trong Cổng, "XK" là BIỂU THUẾ XUẤT KHẨU (tệp
     customs-types.js trong thư mục `lib` dòng 21; tệp README.md trong thư mục `data/bieu-thue`
     dòng 97-98 — `EV-XK`/`UKV-XK`/`CPTPP-XK` là các sheet xuất khẩu), đường so ưu đãi thật là
     tệp fta.js trong thư mục `lib` dòng 73-83 so mã 2 chữ với `thanhVien`. Ô "Xuất xứ: XK"
     vẫn đọc thành `HK` (khách hay gõ XK cho Hồng Kông) nhưng KHÔNG BAO GIỜ gửi "XK" lên Cổng.
  4. **D — "Mỹ" (có dấu) = Hoa Kỳ, "MY"/"my" (không dấu) = Malaysia.** Khoá `'my'` trong từ điển
     `NUOC` (`packs/hs/input.js:99`) **GIỮ** (xoá đi là lặp lại đúng lỗi "bác bỏ nước thật" bị
     chặn ở vòng 2); `findCountryInText` nay so trên từ CHƯA rụng dấu nên phân biệt được hai nước.
- **Bảng `ALIAS` riêng, chỉ dùng ở ô CÓ NHÃN** (`packs/hs/input.js:120`): `UK→GB`, `ANH→GB`,
  `XK→HK`, `VD→VN`. KHÔNG dùng khi quét trong câu tự do: "anh" trong "anh gửi hàng" là đại từ,
  "UK" trong "size UK 10" là kích cỡ áo. `VD→VN` lấy theo chỉ đạo giám đốc; `grep '"VD"'` toàn
  repo `hs-code-api` không có kết quả nào — đã ghi chú trong mã nguồn để đối chiếu lại.
- **Sửa trích dẫn sai:** `countryCode` trước đây trích tệp import-oz-declarations.mjs trong thư
  mục `scripts` của repo **hs-code-api** dòng 87 (`mapOriginToIso2`) — hàm đó nhận MỌI cặp chữ
  2 ký tự nên không phải bảng tra nước (cũng là nơi gốc của việc gửi mã rác lên Cổng). Nay trích
  đúng tệp iso-3166-vn.json trong thư mục `data` + tệp fta.js trong thư mục `lib` dòng 30-48.
- **Bài học ghi lại:** cùng một bài toán ("đọc xuất xứ") có HAI đường vào — ô có nhãn và câu tự do —
  nên mọi hàm đọc phải dùng CHUNG một cách tách từ; hai bản tách lệch nhau làm lỗi "Mỹ = Malaysia"
  quay lại đúng lúc sửa xong. Và: khi sửa bảng dữ liệu, phải tra bằng chứng ở repo Cổng (`hs-code-api`)
  trước khi tin tên gọi — giám đốc đoán "XK = Hồng Kông" theo tên sheet `EV-XK`, nhưng đọc
  tệp customs-types.js trong thư mục `lib` của repo đó mới thấy XK là hướng XUẤT KHẨU.
- **Cổng máy:** `npm test` 1289/1289 (+20 test đạt) · `npm run eval` 32/32 · `node scripts/qa-that.mjs --mock`
  6/6 · `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).

## 2026-11-12 — OZV-430 điểm 1 (vòng soát 3): tên nước có dấu thôi bị đọc thành mã ISO

- **Commit mã nguồn đã đọc:** `f8083c8` (nhánh `ozv-430-don-no-packs-hs`), đối chứng `origin/main` = `d776735`.
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (dòng OZV-430 điểm 1), `docs/wiki/log.md`.
- **Vì sao:** giám đốc chặn PR #214 lần hai. Bản vá vòng 2 xét hình "hai chữ cái" trên
  `nGoc = boNhanXuatXu(norm(t))`, mà `norm` đã **rụng dấu**, nên `"Mỹ" → "my"` trùng mã ISO
  Malaysia và không bao giờ xuống tới `NUOC['my'] = 'US'`. Bảng so sánh hai worktree:

  | ô "Xuất xứ:" khách gõ | main (`d776735`) | nhánh vòng 2 | nhánh nay |
  | --- | --- | --- | --- |
  | `Mỹ` / `mỹ` / `MỸ` | `US` | **`MY`** ✗ | `US` |
  | `Xuất xứ: Mỹ` | `null` | **`MY`** ✗ | `US` |
  | `MY` / `My` / `my` | `MY` | `MY` | `MY` |
  | `Hoa Kỳ` / `Malaysia` | `US` / `MY` | `US` / `MY` | `US` / `MY` |

  Nguy đúng thứ vừa ghi thành luật: `giaDinh:false` nên bot KHÔNG nói giả định, khách đọc thuế
  Malaysia mà tưởng thuế hàng Mỹ — số sai trông như thật (Điều III + Điều VIII).
- **Vá thế nào:** mã ISO-3166 **không bao giờ có dấu** ⇒ thêm rào `coDau` (`packs/hs/input.js:9`)
  cho ngữ cảnh "ô khai riêng một mã". So dấu trên **token cuối** của giá trị còn dấu, không so cả
  chuỗi, vì nhãn ô cũng có dấu ("Xuất xứ: MY") — so cả chuỗi thì mã thật sau nhãn lại bị bác bỏ.
  **Không** bỏ `MY` khỏi bảng ISO: đó là lặp lại đúng lỗi "bác bỏ nước thật" bị chặn ở vòng 2.
- **Bài học ghi vào test:** 31 ca của vòng 2 không bắt được vì không ca nào dùng tên nước CÓ DẤU
  mà bản không dấu trùng một mã ISO — lỗi lọt qua 4 cổng xanh hai lần liền. Nay `NUOC` được xuất
  ra (`packs/hs/input.js:88`) và có ca đòi **mọi khoá từ điển đều có ca cả bản có dấu**: thêm khoá
  mà quên ca test là đỏ ngay. Thêm ca **dấu rời NFD** (Zalo/iOS gửi "Mỹ" = "My" + dấu ngã rời).
  Bộ `packs/hs/test/xuat-xu-ma-nuoc.test.mjs` lên **70 ca**.
- **Cổng máy:** `npm test` 1283/1283 + 34 · `npm run eval` 32/32 · `node scripts/qa-that.mjs --mock`
  6/6 · `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang). Ba script đo luồng tên của giám đốc
  (`v6`, `v6b`, `v6d`) chạy trên hai worktree ra **giống hệt nhau** — không hồi quy.

## 2026-11-12 — OZV-430 điểm 1: ô "Xuất xứ" chỉ cho mã nước THẬT đi tới Cổng

- **Commit mã nguồn đã đọc:** `d776735` (nhánh `ozv-430-don-no-packs-hs`, dựng từ `origin/main` sau khi PR #213 đã gộp).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (thêm dòng OZV-430 điểm 1), `docs/wiki/log.md`.
- **Vì sao:** `countryCode` chỉ kiểm **hình** ("hai chữ cái") chứ không kiểm mã đó có phải nước
  thật không, nên mọi viết tắt khách gõ trong ô "Xuất xứ:" đều thành mã nước và đi thẳng tới Cổng
  OZ. Đo trên đường thật `hs.handle` (gói 3 "Viết mô tả khai báo", gói 6 "Rủi ro nhãn hiệu"), bảng
  so sánh hai worktree:

  | ô "Xuất xứ:" khách gõ | main (`d776735`) | nhánh này |
  | --- | --- | --- |
  | `TQ` | `TQ` | `CN` |
  | `SX tại TQ` | `SX` | `CN` |
  | `QC tại VN` | `QC` | `VN` |
  | `hàng CE` | `CE` | (không gửi nước) |
  | `JP` / `Nhật Bản` | `JP` | `JP` (giữ nguyên) |
  | `CF8M` / `PN16` | (không gửi) | (không gửi, giữ nguyên) |

  Hai điều của hiến pháp bị chạm: **Điều III** — mức MFN/ACFTA Cổng trả phụ thuộc mã nước, gửi
  `SX` hay `TQ` là tra thuế theo một thứ không phải nước nên Cổng không khớp dòng FTA nào, ưu đãi
  C/O mẫu E rụng và khách đọc mức thuế cao hơn thực tế; **Điều VIII** — mã này còn đi vào
  `sinh_mo_ta_khai_bao`, tức in lên **mô tả khai báo** khách dán vào chỉ tiêu 1.78 tờ khai, nên
  "xuất xứ SX" là hồ sơ sai.
- **Vá ở cửa dữ liệu, không lọc lúc in:** danh sách mã ISO-2 bot biết `MA_NUOC_BIET` +
  `laMaNuoc` (`packs/hs/input.js:99`, `packs/hs/input.js:105`); mã ngoài danh sách trả `null`, và
  "TQ" đọc thành `CN` như `findCountryInText` vẫn làm (`packs/hs/input.js:107`). Thứ tự quan trọng:
  mã ISO hai chữ cái xét TRƯỚC từ điển tên nước, vì `norm('MY')` ra `'my'` và từ điển đọc thành
  "Mỹ" ⇒ `US`, sai hẳn nước. Vòng quét mã trong câu chỉ nhận chữ IN HOA — quét cả chữ thường thì
  "made in JP" lấy `in` (Ấn Độ) và đè mất `JP` (lỗi này bản vá đầu của thợ có thật, test bắt được).
- **Dùng lại, không làm kiểu riêng:** tra MCP `sourcebot` thấy repo `hs-code-api` đã có đúng cách
  này ở hàm `mapOriginToIso2` (scripts/import-oz-declarations.mjs dòng 87 của repo đó: tra từ điển
  tên nước trước, rồi mới chấp mã 2 chữ) và bảng tên nước → ISO-2 ở lib/origin-hints.js của repo
  đó. Làm theo thứ tự đó.
- **Test:** `packs/hs/test/xuat-xu-ma-nuoc.test.mjs` (22 ca — đi đường thật `hs.handle` ở cả gói 3
  và gói 6, có bản **vòng hỏi 2 và 3** khi khách sửa ô Xuất xứ, và cả câu **có dấu lẫn không dấu**).
  16/22 ca đỏ trước bản vá. Đo không hồi quy luồng tên: ba script đo luồng tên của giám đốc (v6,
  v6b, v6d trong /tmp/soat5) chạy trên hai
  worktree (nhánh và `origin/main`) ra **giống hệt nhau**. Bốn cổng: `npm test` 1235/1235 + 34,
  `npm run eval` 32/32, `node scripts/qa-that.mjs --mock` 6/6,
  `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).

## 2026-11-12 — Vòng soát 5 PR #213 / OZV-323: hai HỒI QUY của bản vá vòng 4 — sửa tên LẦN HAI, và câu HỎI của khách bị gửi đi làm tên hàng

- **Commit mã nguồn đã đọc:** `bdb9dcd` (nhánh `ozv-323-xac-nhan-ten-go-nham`, không rebase — nhánh đang gánh cả #212).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (bổ sung vòng soát 5 vào dòng OZV-323; sửa trích dẫn `laXacNhan` sang `packs/hs/doc-tra-loi.js:178` sau khi chuyển tệp), `docs/wiki/an-toan.md` (lần cắt tệp thứ ba của lớp hỏi lại và số dòng thật của bốn tệp), `docs/wiki/log.md`.
- **Vì sao:** giám đốc soát vòng 5 CHẶN hai điểm. `soat-khac` (Gemini) lượt này ra ĐẠT nhưng script
  đo tay của giám đốc dựng lại được hai lỗi, và cả hai là **HỒI QUY** — đo cùng những câu đó trên
  `origin/main` (`9275a14`) bằng cùng một script trên đường thật `hs.handle` thì `main` ra ĐÚNG HƠN.
  Bảng đo hai nhánh (tên hàng gửi Cổng):

  | câu khách | PR #213 trước vá | main |
  | --- | --- | --- |
  | "máy sấy sinh tố" → "máy sấy thực phẩm" → "máy sấy công nghiệp" → "350W 220V" | `máy sấy thực phẩm máy sấy công nghiệp` | `máy sấy thực phẩm 350W 220V` |
  | "may say sinh to" → "may say thuc pham" → "may say cong nghiep" → "350W 220V" | `máy sấy thực phẩm may say cong nghiep` | `máy sấy thực phẩm 350W 220V` |
  | "máy sấy sinh tố" → "là sao ạ" | `sao` — TÊN HÀNG RỤNG HẲN | `máy xay sinh tố là sao 350W 220V` |
  | "máy sấy sinh tố" → "nghĩa là gì ạ" | `nghĩa` — TÊN HÀNG RỤNG HẲN | `máy xay sinh tố nghĩa 350W 220V` |
  | "máy sấy sinh tố" → "ý em là sao ạ?" | `ý là sao` — TÊN HÀNG RỤNG HẲN | `máy xay sinh tố ý là sao 350W 220V` |

  1. **Khách sửa tên LẦN THỨ HAI thì bệnh ghép đôi của vòng 4 trở lại.** Cờ `khachDuaTenMoi` của
     bản vá vòng 4 treo vào `hoiXacNhanTen` — một biến **đổi giá trị giữa các vòng hỏi**: sau lần
     sửa tên thứ nhất, tên là do KHÁCH gõ nên bot thôi hỏi xác nhận (`hoiXacNhanTen: false`), nên
     lần sửa thứ hai rơi đúng nhánh nối hai tên. Cổng nhận một mặt hàng lai mang CẢ HAI món khách
     đã sửa, bot in mã + thuế của thứ không tồn tại (Điều III, Điều VIII).
     → Vá: thứ cần phân biệt không phải "có hỏi xác nhận tên hay không" mà là nhánh đang treo hỏi
     **TÊN** hay hỏi **THUỘC TÍNH**. Hàm mới `laHoiThuocTinh` đọc cờ `hoiThuocTinh` do chính NHÁNH
     khai lúc dựng câu hỏi, không suy từ trạng thái vòng hỏi; phiên cũ thì suy từ `thieu`.
  2. **Khách HỎI LẠI thì câu hỏi của khách bị gửi đi làm TÊN HÀNG.** `coTenTrong` đếm chữ của câu
     hỏi thành tên mới, nên bot đi tra mã của chữ "sao" — mã chắc chắn sai, mà mô tả khai báo in
     thẳng cho khách dùng. `main` sai nhẹ hơn vì vẫn giữ được tên hàng.
     → Vá: hàm mới `laCauHoiKhach`/`bocCumHoi`, **dùng lại cách của repo `ai-live`** (hàm `laCauHoi`
     ở tệp phong/nguon-tiktok.js của repo đó, dòng 28 — tra bằng MCP `sourcebot`): đo bằng CỤM CHỮ
     HỎI chứ không bằng dấu "?" trơ, vì dấu hỏi trơ bắt oan câu khách sửa tên có kèm "?". Câu hỏi
     thì không bật `khachDuaTenMoi`: tên hàng khách đã gõ giữ nguyên, thông số nêu kèm vẫn giữ, và
     còn vòng thì bot tự hỏi tiếp một câu cho khách (Điều II). `docTraLoiTen` cũng chặn câu hỏi mở
     đầu bằng chữ phủ định ("không hiểu ạ" — trước vá Cổng nhận tên hàng là "hiểu").
- **Một đỏ do chính bản vá, thợ tự dựng được:** mẫu hỏi tách riêng "gì" bắt oan chữ "gia" trong
  "gia dụng"/"gia đình" nên ca `[#213-7]` (câu đáp CÔNG DỤNG) rụng tên hàng — nay viết đủ cụm
  "là gì"/"gì vậy" và chốt biên từ Unicode hai đầu.
- **Điều VI (lần cắt tệp thứ ba của lớp hỏi lại):** bản vá đẩy `packs/hs/ky-luat-hoi.js` lên 367
  dòng (cổng `test/core/wiki-no-lon-dong.test.mjs` bắt đỏ). Cắt theo đúng ranh trách nhiệm như hai
  lần trước: nhận diện câu khách HỎI LẠI sang tệp mới `packs/hs/cau-hoi-khach.js` (85 dòng), các
  hàm ĐỌC câu trả lời (`docTraLoiTen`, `bocXaGiao`, `laXacNhan`, `bocDemDau`) về
  `packs/hs/doc-tra-loi.js` (224 dòng) — chúng là phần ĐỌC, không phải phần ĐO. Nay cả bốn tệp đều
  dưới trần: `packs/hs/dien-cho-thieu.js` 275, `packs/hs/doc-tra-loi.js` 224,
  `packs/hs/ky-luat-hoi.js` 208, `packs/hs/cau-hoi-khach.js` 85. Các hàm đã chuyển vẫn được tệp cũ
  XUẤT LẠI để chỗ nhập cũ không phải đổi đường dẫn.
- **Nợ sẵn có trên `main`, KHÔNG nong PR ra sửa:** tin đến SAU khi lượt đã chốt đi qua HỒ SƠ GỘP
  của #170 nên mô tả mang cả tên cũ — khoá hành vi hiện tại bằng ca `[#213-13b]`, xin xếp vào
  **OZV-371** cùng điểm 8 ("ok" làm câu trả lời rỗng nghĩa).
- **Test:** `packs/hs/test/soat-213-vong5.test.mjs` (20 ca — 4 ca `[#213-13]` cho chặn 1, 9 ca
  `[#213-14]` cho chặn 2, 5 chốt ngược `[#213-15]` đúng danh sách giám đốc dặn; 11 ca đi đường thật
  qua `hs.handle`, mọi ca mới có cả bản có dấu và không dấu, và có ca cho **vòng hỏi thứ HAI/BA** —
  đúng chỗ bốn vòng qua lỗi đều trốn). 4 ca đỏ trước bản vá.
- **Cổng:** `npm test` 1213/1213 · `npm run eval` 32/32 · `node scripts/qa-that.mjs --mock` 6/6 ·
  `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).

## 2026-11-12 — Vòng soát 4 PR #213 / OZV-323: hai HỒI QUY của chính bản vá — ghép đôi mặt hàng và hai số cùng loại đánh nhau

- **Commit mã nguồn đã đọc:** `7be2f94` (nhánh `ozv-323-xac-nhan-ten-go-nham`, không rebase — nhánh đang gánh cả #212).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (bổ sung vòng soát 4 vào dòng OZV-323), `docs/wiki/an-toan.md` (số dòng thật sau bản vá: `packs/hs/ky-luat-hoi.js` 283 → 295, `packs/hs/doc-tra-loi.js` 80 → 99), `docs/wiki/log.md`.
- **Vì sao:** giám đốc soát vòng 4 CHẶN hai điểm, cả hai là **HỒI QUY** — đo cùng những câu đó trên
  `origin/main` (`9275a14`) bằng cùng một script trên đường thật `hs.handle` thì `main` ra ĐÚNG, mã
  mới của PR làm nó sai. Bảng đo hai nhánh:

  | câu khách | PR #213 trước vá | main |
  | --- | --- | --- |
  | "máy sấy sinh tố" → "máy sấy thực phẩm ạ" → "350W 220V" | `máy sấy sinh tố máy sấy thực phẩm 350W 220V` | `máy sấy thực phẩm 350W 220V` |
  | "máy sấy sinh tố" → "là máy sấy thực phẩm" → "350W 220V" | ghép, lọt cả chữ "là" | `máy sấy thực phẩm 350W 220V` |
  | "Tra hs máy sấy sinh tố 350W" → "350W 220V" | `… 350W 350W 220V` | không lặp |
  | "Tra hs máy xay sinh tố 350W" → "500W 220V" | `… 350W 500W 220V` | số MỚI thắng |

  1. **Khách sửa tên mà KHÔNG mở đầu bằng "không" ⇒ Cổng nhận GHÉP ĐÔI hai mặt hàng.** Người Việt
     sửa tên hay nói thẳng ("máy sấy thực phẩm ạ"), không nói "không". Lúc đó `docTraLoiTen` không
     vào nhánh phủ định, `laXacNhan` cũng false ⇒ `botDoanTen` = true ⇒ `tenChuan = tenGoc`, rồi
     phép đo `trung` ra false nên tên CŨ bị dán lên trước tên MỚI. `packs/hs/packages.js:218` còn
     ghi tên ghép đó vào `tenGoc` nên nó **sống trong session** sang vòng sau: khách buông "cứ tra
     đi" ở vòng 2 thì GIẢ ĐỊNH cũng mang hai món. Bot in mã + thuế của một thứ không tồn tại
     (Điều III, Điều VIII).
  2. **Thông số cũ còn trong `tenChuan` ⇒ hai con số cùng loại đánh nhau.** `giuThongSo` được viết
     ra ĐÚNG để quyết số nào sống (số MỚI cùng loại thắng số CŨ), nhưng nó không bao giờ thấy xung
     đột vì số cũ đã lọt vào qua phần TÊN: lặp "350W 350W", và nặng hơn là khách SỬA số
     ("350W" → "500W") mà Cổng nhận cả hai, không biết số nào thật.
- **Đã vá** (đúng một chỗ: dòng nối mô tả ở `packs/hs/doc-tra-loi.js`): cờ `khachDuaTenMoi` =
  `coTenTrong(thongSoMoi)` ở nhánh CÓ hỏi xác nhận tên ⇒ tên khách **THAY** `tenChuan`, không nối
  vào sau; phần tên truyền vào `giuThongSo` là `chuTrong(tenChuan)` chứ không phải `tenChuan` thô,
  để `giuThongSo(…, tenGoc)` là chỗ DUY NHẤT quyết thông số nào sống. Hàm `bocDemDau` tách ra từ
  `DEM_DAU_RE` (`packs/hs/ky-luat-hoi.js`) để nhánh khách sửa tên mà KHÔNG phủ định cũng bỏ được từ
  đệm "là" — trước đó chỉ nhánh phủ định bóc cụm này. Chỉ xét ở nhánh `hoiXacNhanTen`: nhánh hỏi
  THUỘC TÍNH ("inox hay thép?") thì câu đáp là CHẤT LIỆU của đúng món đó, đọc thành tên mới là làm
  rụng hẳn tên hàng ("van bi" → Cổng chỉ nhận "inox 304 DN50").
- **Nợ sẵn có trên `main`, KHÔNG nong PR này ra sửa:** tin đến SAU khi lượt đã chốt (khách buông
  "cứ tra đi" rồi mới gõ "350W 220V") đi qua HỒ SƠ GỘP của #170 nên mô tả mang cả tên cũ — đo y hệt
  trên `main`. Chỉ KHOÁ hành vi hiện tại bằng ca `[#213-10b]`.
- **Điểm 3 của `soat-khac` (Gemini):** giám đốc dựng lại không ra, đã ghi "báo sai" ở PR.
- **Test:** `packs/hs/test/soat-213-vong4.test.mjs` (16 ca — 4 ca `[#213-10]` cho chặn 1 gồm bản
  không dấu, 5 ca `[#213-11]` cho chặn 2, 6 chốt ngược `[#213-12]` đúng danh sách giám đốc dặn,
  11 ca đi đường thật qua `hs.handle` đọc `tenHang` thật sự gửi Cổng). **8 ca đỏ trước bản vá.**
- **Bốn cổng:** `npm test` 1193/1193 + 34, `npm run eval` 32/32, `node scripts/qa-that.mjs --mock`
  6/6, `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).

## 2026-11-11 — Vòng soát 3 PR #213 / OZV-323: bot LẶNG LẼ TRÁO tên khách, và `\b` trượt chữ Việt có dấu

- **Commit mã nguồn đã đọc:** `3640275` (nhánh `ozv-323-xac-nhan-ten-go-nham`, không rebase).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (bổ sung vào dòng OZV-323 hai điểm vá của vòng soát 3 + trích dẫn `tenBacBo` đổi sang tệp mới), `docs/wiki/an-toan.md` (số dòng thật `packs/hs/packages.js` 661 → 665; ghi việc tách `xuLyTraLoiHoiLai` sang tệp mới `packs/hs/doc-tra-loi.js` để `packs/hs/dien-cho-thieu.js` về 268 dòng), `docs/wiki/log.md`.
- **Vì sao:** giám đốc soát vòng 3 CHẶN với hai lỗi THẬT, cả hai dựng lại được bằng chính hàm và
  đường thật của repo:
  1. **Bot lặng lẽ tráo món của khách.** `tenKhachTuGo` chỉ ẩn CÂU HỎI xác nhận, còn `ketQuaHoi` vẫn
     trả `tenGoiY: item.chuan` và `giaDinh: item.giaDinh`. Đường thật: "Tra hs máy sấy" → khách tự gõ
     "máy sấy sinh tố" → "350W 220V" ⇒ Cổng nhận **"máy xay sinh tố 350W 220V"**. Khách gõ MÁY SẤY
     hai lần, bot in mã + thuế của MÁY XAY mà không hỏi một câu nào (Điều III, Điều VIII).
     `tenBiBacBo` không cứu vì khách chưa bác bỏ gì — khách chỉ gõ tên, chưa nói "không".
  2. **`\b` của JS chỉ tính `[A-Za-z0-9_]`** nên ba mẫu ĐO của `daNeu` trượt hết chữ Việt CÓ DẤU:
     `CHAT_LIEU_RE.test('van bi đồng')`, `'tủ gỗ'`, `'chén sứ'`, `QUY_CACH_RE.test('ống thép đúc')`,
     `CONG_DUNG_RE.test('loại cầm tay')`, `'dùng để sấy'` đều `false` trong khi bản KHÔNG dấu `true`.
     Hệ quả trên đường thật: "Tra hs máy sấy sinh tố" → "không, loại cầm tay 350W 220V" ⇒ Cổng nhận
     **"loại cầm tay 350W 220V"** — RỤNG HẲN tên hàng, vì `coTenTrong` không bóc được cụm công dụng
     nên đếm nó thành tên mới.
- **Đã vá:** biên từ Unicode `(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])` qua hàm `tu()` thay cho `\b`, thêm
  dấu còn thiếu của "cầm" và cả hai cách đặt dấu "thuỷ"/"thủy"; tên bot đoán chỉ được thay tên khách
  khi khách XÁC NHẬN RÕ (`laXacNhan`), tên khách gõ KHÁC tên bot đoán thì bắt buộc HỎI và `giaDinh`
  dựng từ tên khách. Vá thêm hai lỗi thợ tự dựng được khi lần theo: mô tả gửi Cổng lặp tên hai lần
  ("máy sấy máy sấy sinh tố"), và **hồi quy do chính bản vá này** — `[soát #203-5]` đỏ vì vòng 2 hỏi
  lại Y NGUYÊN câu xác nhận tên đã hỏi, treo khách giữa hai vòng (Điều II); chặn bằng `tenDaHoi`.
- **Điều VI:** bản vá đẩy `packs/hs/dien-cho-thieu.js` lên 332 dòng (cổng
  `test/core/wiki-no-lon-dong.test.mjs` bắt đỏ); tách `xuLyTraLoiHoiLai` sang tệp mới
  `packs/hs/doc-tra-loi.js` (80 dòng) theo đúng ranh trách nhiệm — DỰNG câu hỏi / ĐO / ĐỌC câu trả
  lời — và xuất lại để `packs/hs/packages.js` cùng bốn tệp test không phải đổi đường dẫn nhập.
- **Cổng máy:** `npm test` 1177/1177, `npm run eval` 32/32, `node scripts/qa-that.mjs --mock` 6/6,
  `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).

## 2026-11-11 — Vòng soát 2 PR #213 / OZV-323: tên khách đã BÁC BỎ sống lại ở vòng hỏi 2

- **Commit mã nguồn đã đọc:** `7d7c1b7` (nhánh `ozv-323-xac-nhan-ten-go-nham`).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (bổ sung vào dòng OZV-323 ba điểm vá của vòng soát 2 kèm chứng cứ `tệp:dòng`), `docs/wiki/an-toan.md` (số dòng thật của `packs/hs/packages.js`: 656 → 661, và ghi lại việc chuyển hai hàm ĐO ra khỏi `packs/hs/dien-cho-thieu.js` để tệp đó không vượt mốc 300 dòng), `docs/wiki/log.md`.
- **Vì sao:** giám đốc soát vòng 2 (soát chéo Gemini, khác model thợ) CHẶN: bản vá vòng 1 ĐẠT nhưng
  còn ba lỗi THẬT, cả ba dựng lại được bằng chính hàm của repo. Nặng nhất là đúng cái lỗi PR này đi
  sửa: **tên khách VỪA BÁC BỎ sống lại ở vòng hỏi 2.** Đường thật qua `hs.handle`: khách gõ
  "Tra hs máy sấy sinh tố" → bot hỏi "em hiểu là máy xay sinh tố … đúng không ạ?" → khách đáp
  "không ạ" → bot xin thông số → khách đáp "220V" → `tenHang` gửi Cổng là **"máy xay sinh tố 220V"**.
  Khách nói KHÔNG phải máy xay mà bot vẫn in mã + thuế của máy xay, mà im lặng (Điều III, Điều VIII).
  Gốc: `tenKhachTuGo` chỉ ẩn CÂU HỎI xác nhận, nhánh nghi gõ nhầm vẫn trả `tenGoiY: item.chuan` và
  `{...ktTiep}` ghi đè vào `session.hoiLai`, nên lượt sau `packs/hs/dien-cho-thieu.js` lấy lại đúng
  tên đã bị phủ định. Hai lỗi còn lại cùng gốc "đoán tên hàng từ hình dạng chuỗi": từ xã giao/đệm
  NGAY SAU chữ phủ định đủ ≥2 chữ cái nên bị coi là tên mới (`'không phải đâu ạ'` → `ten: 'đâu'`,
  `'không nhé, 350W 220V'` → `ten: 'nhé, 350W 220V'` — **rụng hẳn tên hàng**, mà đây là câu người
  Việt nói hàng ngày); và `chuTrong` không bóc phần trả lời `moRong` của chính nhánh đang treo nên
  `'không, loại gia dụng 350W 220V'` → `ten: 'loại gia dụng 350W 220V'`, cũng mất tên hàng.
- **Đã sửa:** danh sách `tenBiBacBo` đi theo mạch (`packs/hs/packages.js`, cộng dồn qua các vòng) và
  `kiemTraThongTinPhanLoai` **cấm cửa** những tên đó ở cả `tenGoiY` lẫn ở `giaDinh` — khách bác bỏ
  rồi buông "cứ tra đi" cũng không còn tra theo giả định mang tên bot đoán (lỗ thứ tư, thợ tự dựng
  thêm được khi vá điểm 1); `PHU_DINH_RE` tiêu thụ cả cụm xã giao/đệm sau chữ phủ định
  (`đâu|ạ|à|nhé|nha|ơi|mà|thế|vậy`) — chỉ có từ đệm thì lùi về tên khách đã gõ, có dấu ngắt đóng cụm
  thì bóc rồi đọc tiếp phần tên; `coTenTrong` bóc `CONG_DUNG_RE` và từ loại ("loại/kiểu/dạng") trước
  khi ĐO phần chữ — chỉ bóc khi ĐO, mô tả gửi Cổng vẫn giữ nguyên văn công dụng vì công dụng có thể
  đổi dòng thuế.
- **Điều VI:** `packs/hs/dien-cho-thieu.js` chạm 320 dòng sau bản vá. Thay vì ghi thêm một tệp vượt
  mốc vào wiki, hai hàm ĐO thuần (`coThongSo`, `nhanDienCuTraDi`) chuyển sang
  `packs/hs/ky-luat-hoi.js` cho đúng phân công đã ghi ở đầu hai tệp ("tệp này DỰNG câu hỏi, tệp kia
  ĐO"); `packs/hs/dien-cho-thieu.js` xuất lại chúng nên `packs/hs/loc-tap-am.js` và test cũ không
  phải đổi đường dẫn nhập. Tệp về đúng 300 dòng.
- **Test đỏ trước:** 8 ca mới ở `packs/hs/test/tra-loi-hoi-lai.test.mjs` (nhóm `[#213-5]`, `[#213-6]`,
  `[#213-7]`), trong đó 3 ca của điểm 1 đi **đường thật** qua `hs.handle` và đọc `tenHang` thật sự
  gửi Cổng qua ba lượt. Chép tệp test sang worktree ở `7d7c1b7` (trước bản vá): **7/19 ca đỏ**;
  sau bản vá 19/19 xanh.
- **Tra `sourcebot` trước khi viết:** repo **hs-code-api** (tệp từ vựng trong thư mục `lib`, hàm
  `biPhuDinh`) có sẵn lớp đọc phủ định tiếng
  Việt rất đủ (`biPhuDinh`, `phuDinhCaDoan`, `coKhangDinh`, bảng `phuDinhChung`) — repo khác, không
  có trong repo này.
  **Không dùng lại được trực tiếp** vì nó đo phủ định của một CỤM TỪ bên trong văn bản dài (tìm
  "chân không" ở tờ khai) chứ không phải đọc câu trả lời "không ạ" cho câu bot vừa hỏi, và nó kéo
  theo tệp từ vựng + cấu hình riêng (Điều: không thêm dependency). Nhưng dùng lại hai **cách làm**
  của nó: tách "từ khẳng định xen vào" ra khỏi phần tên (như `coKhangDinh`), và xếp mẫu dài trước
  mẫu ngắn khi khớp. `packs/hs/ky-luat-hoi.js` vẫn là nơi duy nhất giữ kỷ luật hỏi này.
- **Cổng máy:** `npm test` 1164/1164 + 34 test đạt, `npm run eval` 32/32,
  `node scripts/qa-that.mjs --mock` 6/6, `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).

## 2026-11-11 — Vá vòng soát PR #213 / OZV-323: bốn tác dụng phụ của lớp đọc câu trả lời hỏi lại

- **Commit mã nguồn đã đọc:** `5845088` (nhánh `ozv-323-xac-nhan-ten-go-nham`).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (bổ sung vào dòng OZV-323 bốn điểm vá kèm chứng cứ `tệp:dòng`), `docs/wiki/an-toan.md` (số dòng thật của `packs/hs/packages.js`: 649 → 656, và nói lại cho đúng vì sao tệp dài thêm), `docs/wiki/log.md`.
- **Vì sao:** giám đốc soát PR #213 (soát chéo bằng Gemini, khác model thợ) CHẶN: phần việc chính
  đúng, nhưng cổng mới làm hỏng các nhánh hỏi lại KHÁC. Nặng nhất là bot ĐẢO NGƯỢC nghĩa câu khách:
  `docTraLoiTen` chạy trên MỌI câu trả lời hỏi lại, không kiểm câu đang treo có phải câu xác nhận
  TÊN hay không, nên `docTraLoiTen('không mạ kẽm, đúc DN50', { tenGoc: 'ống thép DN50' })` trả
  `ten: 'mạ kẽm, đúc DN50'` — mất tên hàng VÀ ngược nghĩa. Khách nói "KHÔNG mạ kẽm" mà Cổng nhận
  "mạ kẽm" thì mã HS và số thuế in ra là của mặt hàng khác, mà im lặng: khách không có cách nào
  biết (Điều III, Điều VIII). Ba điểm còn lại cùng một gốc — lớp này đoán quá nhiều từ hình dạng
  chuỗi: phép "còn ≥ 2 chữ cái thì là tên hàng" nhận lầm ĐƠN VỊ đo (kW, VAC, mm, kg, ml) thành tên
  nên `'không, 0.5kW 220V'` làm rụng hẳn tên hàng; `PHU_DINH_RE` neo `^\s*` nên câu người Việt nói
  hàng ngày "Dạ không, là máy sấy thật ạ" trượt khỏi phủ định; `XA_GIAO_CUOI_RE` chứa `d[aạ]` nên
  cắt cả "da" KHÔNG dấu, mà "túi da" 4202 khác chương với túi nhựa.
- **Đã sửa:** cờ `hoiXacNhanTen` đi theo kết quả hỏi lại (`ketQuaHoi`, `packs/hs/ky-luat-hoi.js`)
  nên chỉ nhánh CÓ câu "em hiểu là <tên> đúng không ạ?" mới được đọc "không…" là phủ định TÊN;
  `chuTrong`/`coTenTrong` bóc thông số ra TRƯỚC rồi mới đo phần chữ; `giuThongSo` chỉ bù những LOẠI
  đại lượng câu mới chưa nêu (khách sửa "0.5kW" thì "350W" của tin trước phải mất, không nối thêm);
  `PHU_DINH_RE` nhận tiền tố lễ phép "dạ/vâng/ừ"; hai mẫu xã giao chỉ cắt "dạ" CÓ dấu.
- **Điểm thứ tư giám đốc chưa dựng lại được thì có thật, đã vá:** `xuLyTraLoiHoiLai` luôn trả
  `sanSangTra: true` nên nhánh vòng hỏi THỨ HAI ở `packs/hs/packages.js` là MÃ CHẾT — khách sửa tên
  mà chưa đưa thông số thì bot đi tra luôn với mô tả cụt, trong khi trần của #136 là 2 vòng. Nay
  vòng 2 đo lại chính mô tả khách vừa sửa và truyền `tenKhachTuGo: true` để KHÔNG xác nhận lại cái
  tên khách vừa gõ (hỏi lại điều khách đã nêu là trái luật 2 của kỷ luật hỏi); khách buông "cứ tra
  đi" thì tra ngay, không hỏi nữa (Điều II).
- **Test đỏ trước:** `packs/hs/test/tra-loi-hoi-lai.test.mjs` (11 ca cho cả 4 điểm; 2 ca của điểm 4
  đi đường thật qua `hs.handle`, đếm số lần gọi Cổng và đọc `tenHang` thật sự gửi đi). Bốn test cũ
  ở `packs/hs/test/xac-nhan-ten.test.mjs` dựng phiên hỏi lại bằng tay nên thiếu cờ mới — đã đổi
  sang dựng phiên bằng CHÍNH `kiemTraThongTinPhanLoai`, giữ nguyên ý gốc: gõ tay là khoá một phiên
  GIẢ, test xanh mà đường thật vẫn hỏng.
- **Cổng máy:** `npm test` 1151/1151, `npm run eval` 32/32, `node scripts/qa-that.mjs --mock` 6/6,
  `node scripts/kiem-wiki.mjs --nghiem` ĐẠT.

## 2026-11-11 — Issue #177 (nợ của PR #203) / OZV-323: xác nhận tên nghi gõ nhầm khi thông số đã đủ

- **Commit mã nguồn đã đọc:** `0286242` (nhánh `ozv-323-xac-nhan-ten-go-nham`, xếp chồng trên PR #212).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (thêm dòng việc này, gỡ chữ "còn thiếu" ở dòng yêu cầu 2 vì nợ đã trả), `docs/wiki/an-toan.md` (số dòng thật của `packs/hs/packages.js`: 642 → 649), `docs/wiki/log.md`.
- **Vì sao:** nợ ghi rõ ở PR #203 và trong chính thân `packs/hs/test/ky-luat-hoi.test.mjs`. Đo lại
  bằng hàm của repo, không phỏng đoán: `kiemTraThongTinPhanLoai('máy sấy sinh tố 350W 220V')` trả
  `canHoi: false` — nhánh nghi gõ nhầm `break` ngay khi đủ công suất + điện áp nên câu xác nhận TÊN
  rụng theo. Càng đủ thông số bot càng im, đúng ngược cái cần: thông số đủ nghĩa là chỉ còn MỘT điều
  chưa chắc, là tên món — mà "máy xay sinh tố" là 8509.40.00 còn "máy sấy" thuộc nhóm 8419/8516,
  khác chương và khác mức thuế, nên bot in mã + số thuế của món khách KHÔNG hỏi (Điều III: số tiền
  phải có căn cứ; Điều VIII: không nói như đã biết). Lỗi thứ hai đi kèm:
  `xuLyTraLoiHoiLai('không, là máy sấy thật ạ', { tenGoiY: 'máy xay sinh tố' })` trả mô tả tra cứu
  `"máy xay sinh tố không, là máy sấy thật ạ"` — khách PHỦ ĐỊNH mà bot vẫn dán tên mình đoán lên
  đầu rồi nối cả câu phủ định vào sau; hỏi xác nhận tên mà không nghe câu trả lời "không" thì câu
  hỏi thành vô ích.
- **Đã sửa:** bỏ hẳn cổng `if (co.congSuat && co.dienAp) break` — câu xác nhận tên luôn còn, còn câu
  xin thông số thì `cauXinThem`/`gomCau` tự rút hết nên không hỏi lại điều khách đã nêu.
  `docTraLoiTen` (`packs/hs/ky-luat-hoi.js:116`) đọc câu phủ định và lấy tên khách nói lại; khách
  chỉ nói "không ạ" thì lùi về tên khách ĐÃ GÕ, không dùng tên bot đoán. `giuThongSo`
  (`packs/hs/ky-luat-hoi.js:90`) giữ thông số khách gõ ở tin trước để mô tả dựng lại từ `tenGoiY`
  không làm rụng dữ kiện.
- **Bài học kỹ thuật:** biên từ tiếng Việt phải dùng lookahead `\p{L}` chứ không dùng `\b` — `\b`
  của JS chỉ tính chữ ASCII nên sau "không" hay "là" (kết bằng chữ có dấu) nó không thấy biên và cả
  mẫu trượt im lặng.
- **Lỗi thứ ba lộ ra khi bỏ cổng cũ:** nhánh 0b của gói 1 chạy lại `kiemTraThongTinPhanLoai` trên
  chính câu trả lời của khách, nên khách đáp "không, là máy sấy thực phẩm" thì bot hỏi xác nhận
  đúng cái tên khách VỪA GÕ ("em hiểu là máy sấy thực phẩm đúng không ạ?") — hỏi lại điều khách đã
  nêu, và khách không bao giờ tới được mã (0 lần gọi Cổng). Cổng cũ vô tình che lỗi này. Chặn bằng
  cờ `vuaTraLoiHoiLai` (`packs/hs/packages.js:218`); vòng hỏi tiếp theo do chính nhánh 0a quyết
  bằng `vongHoi` (trần 2 vòng của #136).
- **Hai test cũ khoá đúng hành vi sai này, đã sửa:** `packs/hs/test/ky-luat-hoi.test.mjs` ca "HỒ SƠ
  MẠCH đã có thông số" (chính nó ghi chú đây là nợ) và `packs/hs/test/soat-203.test.mjs` ca
  "#203-4" — chuyển sang tên KHÔNG nghi gõ nhầm, giữ nguyên ý gốc của hai ca.
- **Kiểm tra:** `packs/hs/test/xac-nhan-ten.test.mjs` viết ĐỎ trước (8/11 đỏ, 3 chốt ngược xanh ngay
  để bản vá không thành "hỏi mọi lúc"), có 3 ca đường thật qua `hs.handle` đếm số lần gọi Cổng và
  đọc `tenHang` gửi đi. Bốn cổng máy: `npm test` 1140/1140, `npm run eval` 32/32,
  `node scripts/qa-that.mjs --mock` 6/6, `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).

## 2026-11-11 — PR #204 (soát): bộ đo đọc thêm khuôn giọng Quyên, bỏ 2 ca lấy từ thông báo đính chính

- **Commit mã nguồn đã đọc:** `93e9328` (nhánh `ozv-323-bo-do-do-dung`).
- **Trang wiki đã sửa:** `docs/wiki/kiem-thu.md` (mục "Bộ đo độ đúng phân loại HS": 52 → 50 ca, ba luật kiểm câu khách, hai khuôn tin, thứ tự `roiVaoMaLan` trước `dung6So`), `docs/wiki/log.md`.
- **Vì sao:** người soát PR #204 CHẶN 3 điểm, kiểm tay lại thì cả 3 đều thật. (1) `docMaTuTin` chỉ biết khuôn form đầy đủ, không biết khuôn **giọng Quyên** (`packs/hs/giong-quyen.js:67,70`) — chính khuôn bot dùng ở chat riêng; chạy Cổng thật thì mọi ca giọng Quyên bị chấm "không ra mã" và độ đúng ra **thấp giả**. (2) Hai ca `32082090` và `38249999` lấy nguồn là **thông báo đính chính**: văn bản loại này không có tên hàng (ô "khách gõ" bị chép nguyên văn tên nhóm biểu thuế, ca `38249999` còn cắt cụt giữa câu), và mã trong phần "nội dung đã ban hành" chính là mã **sai** đang được sửa — `2174/TB-TCHQ` sửa `3208.20.90` thành `3208.90.90`, tức đáp án của ca là mã sai luật. Bỏ cả 2 ca, còn **50 ca** vẫn vượt mốc ≥ 30. (3) `chamMotCa` xét `dung6So` trước `roiVaoMaLan` nên 6 ca mã dễ lẫn cùng 6 số đầu bị gọi tên là "lệch 2 số cuối" — nghe như sai nhỏ, che mất lỗi nặng hơn.
- **Kiểm tra:** sau khi rebase lên `main` (đã có #201) chạy lại đủ bốn cổng: `npm test` 1102/1102 + 34 test đạt, `npm run eval` 32/32, `node scripts/qa-that.mjs --mock` 6/6, `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang). Bảy test đỏ-trước trong `test/core/do-dung-hs.test.mjs` khoá cả 3 điểm (24/24 đạt sau khi sửa).
- **Còn dở:** số độ đúng **thật** vẫn chưa có — cần `OZ_MCP_TOKEN` + `GEMINI_API_KEY`, môi trường agent chỉ có `.env.example`.

## 2026-11-11 — Issue #177 yêu cầu 4 / OZV-323: ảnh đi chung một lượt phân loại với hồ sơ mạch

- **Commit mã nguồn đã đọc:** `c6a9478` (nhánh `main`, sau khi #204 đã gộp; lần đo đầu trên `0fb9785`).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (thêm dòng Issue #177 yêu cầu 4 ở mục 3), `docs/wiki/log.md`.
- **Vì sao:** yêu cầu 4 của #177 đổi hành vi lượt ảnh. Đo thật trên `main` bằng chính gói `packs/hs`
  (không phỏng đoán): khách gõ mô tả đủ → bot mở lượt phân loại; khách gửi thêm ảnh tem nhãn ngay sau
  → bot in "👉 Đúng thì gõ ok" như một việc mới, kết quả lượt cũ (hồ sơ chưa có ảnh) vẫn tới khách, rồi
  "ok" mở lượt thứ hai. Khách nhận **hai kết quả cho cùng một món**, có thể hai mã khác nhau, và công ty
  trả hai lượt điểm Cổng (3 điểm/lượt — báo cáo OZV-326). Điều đó trái cả yêu cầu 4 của #177 lẫn luật
  "một mạch một kết quả" của #170 (yêu cầu 6).
- **Cách sửa:** thêm cờ `choKetQuaGoi1` = SỐ LƯỢT gói 1 đang chờ kết quả (`packs/hs/chay-goi.js:49`);
  lưu số lượt chứ không lưu `true` để một kết quả cũ tới muộn không xoá oan cờ của lượt đang chạy
  (`packs/hs/index.js:85` chỉ xoá khi kết quả đúng của lượt mới nhất về). Nhánh ảnh: lượt còn chạy thì
  gộp ảnh vào hồ sơ rồi gọi `trenHoSo` ngay, không hỏi "ok" lần nữa (`packs/hs/flow-photo.js:41`).
  Kết quả lượt cũ tự bị bỏ bằng cơ chế đếm lượt `luotSo` đã có, nên **không cần luật bỏ kết quả mới**.
- **Hai chốt không được bỏ:** (1) ảnh không thêm ô dữ kiện nào thì KHÔNG mở lượt mới — so các ô có cấu
  trúc của hồ sơ, không so `dau` cũng không so `moTaGop`, vì chú thích đàm thoại ("ảnh tem thông số")
  làm cả hai thứ đó đổi mà không nói gì thêm về mặt hàng, và mỗi lượt thừa là tiền thật; (2) lượt đã trả
  kết quả xong rồi mới gửi ảnh thì giữ đường xin xác nhận như cũ — tự mở lượt sau khi khách đã có mã là
  tiêu điểm Cổng ngoài ý khách.
- **Tra chéo repo (MCP `sourcebot`):** khuôn "nhiều ảnh vào MỘT lượt định danh" đã có ở repo
  **hs-code-api** (hàm `docAnhNameplate(anhUrl[])` trong tệp định danh của thư mục `lib`, dòng 45;
  endpoint `/api/identify` nhận tối đa 4 ảnh) và trong hợp đồng công cụ của repo **ozplugin**
  (`dinh_danh_hang`, trường `anhUrl` là mảng tối đa 2 URL) — dùng lại cách đã có, không dựng
  luật gộp ảnh kiểu riêng. (Hai đường dẫn trên thuộc repo khác, không có trong repo này.)
- **Kiểm tra:** `npm test` 1083/1083 + 34 xanh, `npm run eval` 32/32, `node scripts/qa-that.mjs --mock`
  6/6 (G5 — hồ sơ mặt hàng qua nhiều tin có ảnh — ĐẠT), `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).
  Chạy lại đủ bốn cổng sau khi rebase lên `main` đã có #204 — số test ghi ở mục "Kiểm tra" của PR #209.

## 2026-11-11 — Gỡ dấu xung đột git bị commit khi rebase #203 lên main (PR #207)

- **Commit mã nguồn đã đọc:** nhánh `vp/203-1794413716` (trên `f0af33a`), gốc `d797f0e`.
- **Trang wiki đã sửa:** `docs/wiki/an-toan.md` (gỡ dấu xung đột, số dòng thật), `docs/wiki/log.md` (gỡ dấu xung đột, trả lại mục bị rebase làm rụng).
- **Vì sao:** đợt rebase #203 lên `main` mới commit cả dấu xung đột chưa gỡ (`<<<<<<< ours`,
  `=======`, `>>>>>>> theirs`) vào hai trang wiki. Hệ quả đo được: câu "Hiện tại có ba tệp vượt quá
  300 dòng" bị nhân BA với ba bộ số dòng khác nhau (620/627/636 cho `packs/hs/packages.js`), nên
  `test/core/wiki-no-lon-dong.test.mjs` trượt 2 ca — `npm test` ĐỎ. Rebase cũng làm RỤNG hẳn mục
  nhật ký "Vá năm điểm người soát CHẶN PR #203"; đã lấy lại nguyên văn từ
  `origin/ozv-251-hs-xuat-xu-khong-mac-dinh`.
- **Cổng còn thiếu, đã bù:** `node scripts/kiem-wiki.mjs --nghiem` vẫn báo "ĐẠT (16 trang)" khi wiki
  đang chứa dấu xung đột — cổng wiki không đo việc này, lỗi chỉ lộ ở một cổng khác và chỉ với tệp có
  ghi số dòng. Thêm cổng mới `test/core/khong-dau-xung-dot.test.mjs` quét toàn repo: không tệp nào
  được chứa dấu xung đột. Test viết ĐỎ trước (bắt đúng 18 dòng dấu ở hai tệp) rồi mới gỡ.
- **Số dòng thật (`wc -l` ngày 2026-11-11):** `packs/hs/packages.js` 642, `packs/hs/render.js` 471,
  `core/engine.js` 340.

## 2026-11-11 — Issue #201 / OZV-250: trong nhóm, người hỏi tiếp thì bot im (cửa gửi bỏ oan)

- **Commit mã nguồn đã đọc:** `34fd6ea` (nhánh `main`).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (thêm dòng Issue #201 ở mục 3), `docs/wiki/an-toan.md` (số dòng thật của `core/gate.js` và `core/engine.js`), `docs/wiki/log.md`.
- **Vì sao:** #201 đổi hành vi cửa gửi. Bước 6 (chống trùng Jaccard) trước đây so chữ với MỌI tin bot gần đây, nên câu trả lời cho một câu hỏi MỚI bị bỏ chỉ vì trùng chữ câu trước — đo thật trên `main` với gói `packs/hs` thật: QA G2 bước 4 cho `drop: similar:1.00` và bot không gửi gì. Nay phạm vi chống trùng là MỘT CÂU KHÁCH: dấu hiệu là CHỮ câu khách đã chuẩn hoá (`askKey`), không phải mã lượt — vì khách bấm gửi hai lần thì mã lượt KHÁC nhau nhưng chữ GIỐNG nhau, lấy mã lượt sẽ tắt đúng lớp chặn của sự cố #2. Hai ngoại lệ ghi rõ trong code: câu "đang tra" (`progress`) là chữ khuôn nên không được miễn trừ (sự cố #9), và chữ khách rỗng ("@bot" trơ trọi) tính là không biết nên vẫn so chữ (điểm [S6] của người soát).
- **Kiểm tra:** `npm test` 1078/1078 xanh, `npm run eval` 32/32, `node scripts/qa-that.mjs --mock` 6/6 (G2 ĐẠT), `node scripts/kiem-wiki.mjs` ĐẠT (16 trang).

## 2026-11-11 — Vá năm điểm người soát CHẶN PR #203

- **Commit mã nguồn đã đọc:** nhánh `ozv-251-hs-xuat-xu-khong-mac-dinh` (trên `34fd6ea`).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (thêm dòng cho đợt vá #203),
  `docs/wiki/an-toan.md` (số dòng thật của `packs/hs/packages.js` 636 → 642), `docs/wiki/log.md`.
- **Vì sao:** người soát (soat-khac/Gemini) kết luận CHẶN với 5 điểm. Mỗi điểm được viết thành một
  ca test ĐO hành vi thật trước khi sửa (`packs/hs/test/soat-203.test.mjs`) để biết thật hay báo sai:
  điểm 1, 2, 3, 5 đỏ (lỗi thật, đã vá); điểm 4 xanh ngay từ đầu (báo sai ở mức hành vi — vẫn siết
  ngữ nghĩa `ketQuaHoi` và khoá bằng test).
- **Điểm nặng nhất (điểm 5):** nước khách nêu ở lượt TRƯỚC bị rụng, bot gọi `tra_thue` theo `'CN'`
  và in "giả định xuất xứ Trung Quốc" trong khi khách đã nói Nhật — in mức thuế của một nước khách
  KHÔNG nói (Điều III + Điều VIII). Vá bằng `chuHoSoChoXuatXu` (`packs/hs/input.js`) + `xuatXuCuaMach`
  (`packs/hs/packages.js`): hồ sơ mạch #170 thành nguồn xuất xứ ưu tiên THẤP hơn lượt hiện tại.
- **Dùng lại từ repo khác (MCP sourcebot):** tra `erp-xnk/src/lib/portal-review-questions.ts`, dùng lại
  luật `buildQuestionsFromFields` — một field một câu, bỏ field khách đã nêu, KHÔNG có cổng
  tất-cả-hoặc-không. Hai cổng bị người soát nêu chính là chỗ bản vá cũ lệch khỏi luật nó nói là chép.
- **Hai ca eval phải đổi dữ kiện vào:** `cong-ai-ban` và `chung/01-cong-loi-khong-bia-hs` dùng
  "máy hút bụi cầm tay"; sau vá điểm 1 thì mô tả thiếu thông số bị hỏi lại trước và không tới Cổng,
  nên hai kịch bản mất chỗ đo đường CỔNG LỖI. Đổi thành "máy hút bụi cầm tay 600W 220V" (ghi lý do
  ngay trong tệp fixture và trường `moTa` của ca chung).
- **Cổng máy:** `npm test` 1095/1095 + 34 test đạt, `npm run eval` 32/32,
  `node scripts/qa-that.mjs --mock` 6/6, `node scripts/kiem-wiki.mjs --nghiem` ĐẠT.

## 2026-11-11 — Issue #177 (yêu cầu 2): kỷ luật hỏi — không hỏi lại điều khách đã nêu

- **Commit mã nguồn đã đọc:** nhánh `ozv-251-hs-xuat-xu-khong-mac-dinh` (trên `9aa2fed`).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (thêm dòng cho yêu cầu 2 của #177),
  `docs/wiki/an-toan.md` (số dòng thật của `packs/hs/packages.js` 627 → 636), `docs/wiki/log.md`.
- **Vì sao:** đo bằng chính `kiemTraThongTinPhanLoai` thì bot hỏi lại điều khách vừa nói —
  "máy sấy sinh tố 350W" vẫn bị xin "công suất (W) và điện áp"; "van bi inox" vẫn bị hỏi
  "chất liệu bằng đồng, inox hay nhựa ạ?"; khách gõ "Thông số: 350W 220V" ở tin trước rồi tin sau
  gõ tên món thì bị hỏi lại cả hai thông số (lớp hỏi lại chưa đọc hồ sơ mạch của #170). Mỗi lần
  như vậy khách mất thêm một lượt hỏi–đáp trước khi có mã, và nghĩ bot không đọc tin của mình.
- **Việc đã làm:** tra MCP sourcebot trong `github.com/ozvietnam/erp-xnk`, lấy đúng luật kỷ luật
  hỏi đã có ở đó (tệp `src/lib/portal-review-questions.ts` của repo đó, và spec kỷ luật hỏi ngày
  2026-10-24 trong thư mục docs/superpowers/specs của repo đó — cả hai đều NGOÀI repo này)
  chứ không tự nghĩ luật mới: máy tự xác định tối đa trước khi hỏi, chỉ hỏi điều không tự xác định
  được, tối đa 3 câu gom trong MỘT tin, phần còn trống thì ghi "OZ tự xác định". Kèm bài học V4 của
  erp-xnk: chỉ bỏ một câu khi MỌI đại lượng nó hỏi đã có — bỏ câu trùng một phần là mất dữ kiện.
  Viết test đỏ trước (`packs/hs/test/ky-luat-hoi.test.mjs`, 9 ca: 7 đỏ lúc đầu), rồi tách phần đo
  và lọc câu sang tệp riêng `packs/hs/ky-luat-hoi.js` để `packs/hs/dien-cho-thieu.js` về 259 dòng
  (Điều VI — tệp này đã lên 316 dòng sau bản vá, cổng `test/core/wiki-no-lon-dong.test.mjs` bắt đúng).
- **Còn thiếu, ghi lại để không giấu nợ:** khi thông số đã đủ thì bot vẫn KHÔNG xác nhận tên nghi gõ
  nhầm ("sấy" ↔ "xay"), tên sai đi thẳng tới Cổng — sửa chỗ đó phải sửa cùng `xuLyTraLoiHoiLai`
  (nó dựng lại mô tả tra cứu từ `tenGoiY`, làm rụng thông số khách đã gõ), nên để nhịp sau.
- **Kiểm tra:** `npm test` 1084/1084, `npm run eval` 32/32, `node scripts/qa-that.mjs --mock` 6/6,
  `node scripts/kiem-wiki.mjs --nghiem` → "wiki: ĐẠT (16 trang)".

## 2026-11-11 — Issue #177 (yêu cầu 3): bỏ mặc định xuất xứ `'CN'` im lặng

- **Commit mã nguồn đã đọc:** nhánh `ozv-251-hs-xuat-xu-khong-mac-dinh` (gốc `a84e8bb`).
- **Trang wiki đã sửa:** `docs/wiki/an-toan.md` (số dòng thật của `packs/hs/packages.js` 620 → 627 và `packs/hs/render.js` 448 → 471), `docs/wiki/log.md`.
- **Vì sao:** code có bốn chỗ viết `findCountryInText(...) || 'CN'` rồi IN RA tin khách thành
  "💰 Thuế suất (xuất xứ CN)". Khách chưa hề nói nước nào mà tin lại nói như đã biết. Mức MFN/ACFTA
  in ra phụ thuộc đúng cái nước đó, nên đây là số tiền không có căn cứ trong lượt (Điều III) và là
  nói như đã biết điều mình chỉ đoán (Điều VIII). Nay chỉ còn MỘT chỗ quyết định xuất xứ
  (`xuatXuCua` trong `packs/hs/input.js`): trả mã nước để gọi Cổng kèm cờ `giaDinh`, và lớp dựng chữ
  nói rõ "giả định xuất xứ Trung Quốc". Khách có nói nước thì giữ nguyên như cũ.
- **Bài học ghi lại:** nhãn xuất xứ nằm trong tiêu đề khối thuế nên lượt nào cũng in. Hai lượt hỏi
  thuế liên tiếp cùng một mã vốn đã giống nhau 0,77 — sát ngưỡng 0,8 của lưới chống trùng ở cửa gửi
  (`core/gate-decide.js:136`). Bản đầu của vá này nhồi cả câu mời sửa vào nhãn, đẩy độ giống lên 0,83
  và tin thứ hai bị cửa gửi BỎ (khách hỏi mà không thấy trả lời). Nhãn phải ngắn; lời mời khách sửa
  nước đặt ở một dòng riêng. Đã khoá bằng test trong `packs/hs/test/xuat-xu.test.mjs`.
- **Kiểm tra:** `npm test` 1075 đạt / 0 trượt + 34 test đạt, `npm run eval` 32/32,
  `node scripts/qa-that.mjs --mock` 6/6, `node scripts/kiem-wiki.mjs --nghiem` ĐẠT.

## 2026-11-11 — Issue #177 (yêu cầu 5): bộ đo độ đúng phân loại HS dựng từ văn bản pháp luật

- **Commit mã nguồn đã đọc:** `a84e8bb` (nhánh `ozv-323-bo-do-do-dung`).
- **Trang wiki đã sửa:** `docs/wiki/kiem-thu.md` (thêm lệnh `scripts/do-dung-hs.mjs` vào bảng cổng kiểm + mục "Bộ đo độ đúng phân loại HS"), `docs/wiki/log.md`.
- **Vì sao:** repo có 4 cổng kiểm *hành vi* (không trùng tin, không bịa số hiệu, hỏi lại khi thiếu dữ kiện) nhưng **không cổng nào đo mã HS trả ra có đúng mã của văn bản hay không** — tức là không ai biết bot đúng bao nhiêu phần trăm. Thêm `scripts/do-dung-hs.mjs` + bộ đề `eval/bo-de/phan-loai-tu-luat.json` (50 ca sau vòng soát, 26 chương) dựng từ tên dòng biểu thuế và Thông báo kết quả phân loại của Hải quan, **không** lấy từ `oz-gold-final.jsonl` hay tờ khai cũ (CEO 10/11: phân loại HS bám luật). Chấm top-1/top-3 ở **tám số** trên tin gửi khách, qua đúng đường bot thật (dùng lại `runSingleScenario` của `scripts/qa-that.mjs`).
- **Kiểm tra:** `npm test` 1086/1086 + 34 test đạt, `npm run eval` 32/32, `node scripts/qa-that.mjs --mock` 6/6, `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).
- **Còn dở:** số độ đúng **thật** chưa có — cần `OZ_MCP_TOKEN` + `GEMINI_API_KEY` để chạy Cổng OZ thật; môi trường agent chỉ có `.env.example` nên chỉ chạy được `--mock` (kiểm đường đo, không phải độ đúng).

## 2026-11-11 — Issue #168: báo "đang tra", căn cứ pháp lý từ Cổng, chống bịa số hiệu

- **Commit mã nguồn đã đọc:** nhánh `claude/168-can-cu-bao-dang-tra` (gốc `403be42`).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (thêm dòng Issue #168 ở mục 3), `docs/wiki/an-toan.md` (số dòng thật của `core/engine.js` và `packs/hs/packages.js`), `docs/wiki/log.md`.
- **Vì sao:** #168 đổi hành vi gửi tin: thêm kind `progress` (câu "đang tra" ≤ 3 giây, không ăn suất tin/ngày, giờ yên thì bỏ), tin trả lời kèm căn cứ pháp lý chỉ lấy từ Cổng, và một chốt chặn bỏ dòng có số hiệu văn bản không có nguồn. Trang tiến độ ghi rõ phần còn dở (luồng "chốt mã 8 số + menu 1–4", KB9, chấm Gemini, chạy Cổng thật).
- **Kiểm tra:** `node scripts/kiem-wiki.mjs --nghiem` ĐẠT, `npm test` xanh, `npm run eval` 32/32.

## 2026-11-11 — WIKI-04: Cập nhật docs/wiki/tien-do.md ghi nhận T801, T804, T805 Spec 008 đã gộp

- **Commit mã nguồn đã đọc:** `dc03bfb`.
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md`, `docs/wiki/log.md`.
- **Vì sao:** cập nhật bảng trạng thái mục 3 Spec 008 tại `docs/wiki/tien-do.md:82` phản ánh trung thực 3 nhiệm vụ T801, T804, T805 của Spec 008 (Cổng AI Studio) đã hoàn thành và gộp vào nhánh `main` qua các PR #186 (T801: SQLite Queue DB với cơ chế thuê nguyên tử tại `gateway/queue-db.js:1`), PR #194 (T804: Manifest V3 quyền hạn tối thiểu và 8 bộ chọn DOM có phiên bản tại `addon/manifest.json:1`, `addon/selectors.json:1`), PR #193 (T805: Quản lý vòng đời tab pool và cô lập phiên tại `addon/tab-pool.js:1`); kèm các tệp test chuẩn xác (`test/gateway/queue-db.test.mjs:1`, `test/gateway/selectors-schema.test.mjs:1`, `test/gateway/tab-pool.test.mjs:1`); đồng bộ mốc commit và ngày cập nhật trên đầu trang `docs/wiki/tien-do.md` và `docs/wiki/log.md` theo commit `dc03bfb` mới nhất trên nhánh `main`.
- **Kiểm tra:** `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang), `node --test test/gateway/queue-db.test.mjs test/gateway/selectors-schema.test.mjs test/gateway/tab-pool.test.mjs` (17/17 test xanh).

## 2026-11-10 — WIKI-02: Đồng bộ docs/wiki/an-toan.md và docs/wiki/kiem-thu.md theo code main (14595d4)

- **Commit mã nguồn đã đọc:** `14595d4`.
- **Trang wiki đã sửa:** `docs/wiki/an-toan.md`, `docs/wiki/kiem-thu.md`, `docs/wiki/log.md`.
- **Vì sao:** đồng bộ toàn diện `docs/wiki/an-toan.md` và `docs/wiki/kiem-thu.md` (trước đó dậm chân ở commit `0842386` ngày 07/11/2026) theo đúng hiện trạng mã nguồn trên nhánh `main`; loại bỏ triệt để các nhận định cũ không còn đúng (nói chưa có `core/handoff.js`, `scripts/audit.mjs`, `/metrics`, `core/sdt.js`, `core/sanitizer.js` và bước `staff` trong `eval/run.mjs`); bổ sung bảng đối chiếu mục tiêu an toàn (`SC-001`, `SC-002`, `SC-007`), sơ đồ hệ thống lớp bảo vệ đa tầng; cập nhật đầy đủ cấu trúc 74 tệp test `node:test` (844 ca pass) + 34 test chuyển gói đạt 100%, cơ chế chạy eval 17/17 kịch bản (12 kịch bản fixtures và 5 ca kiểm trung lập), các công cụ CLI (`npm run audit`, `npm run do-sc`, `scripts/qa-that.mjs`); đồng bộ bảng đo lường 9 tiêu chí thành công theo `specs/001-nen-tang-chung/sc-do.md` (6/9 Đạt lab, 3/9 Đạt code chờ nghiệm thu chạy thật).
- **Kiểm tra:** `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang), `npm test` 878 test xanh (844 test node:test + 34 test gói), `npm run eval` 17/17 kịch bản đạt.

## 2026-11-09 — WIKI-0911: Cập nhật docs/wiki/tien-do.md theo code main (lệch từ 07/11)

- **Commit mã nguồn đã đọc:** `c4d099d`.
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md`, `docs/wiki/log.md`.
- **Vì sao:** đồng bộ trang tiến độ với code main mới nhất (commit `c4d099d`); cập nhật dòng T022 thành Xong đồng bộ với T024–T026 và T036; chuẩn hoá trạng thái SC-008 theo `specs/001-nen-tang-chung/sc-do.md:20` (ĐẠT lõi, chờ test suite #80 trong `eval/run.mjs`); bổ sung ghi chú trạng thái spec 007 (chưa có plan/tasks và phát hiện lệch giữa `scripts/giam-sat.mjs:84-86` gửi Telegram với spec 007 FR-010 gửi digest); chuyển các mục đã xong ở phần 5 và 6 (tasks.md đã tick hết, `scripts/audit.mjs`, `README.md`, bản Node, T022 tự trở về, `STAFF_CHAT_ID`/`STAFF_USERS`) sang "Đã giải quyết" kèm `tệp:dòng` để xoá bỏ triệt để mâu thuẫn nội tại.
- **Kiểm tra:** `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang), `npm test` 715 test xanh (681 test core + 34 test gói), `npm run eval` 12/12 kịch bản đạt.

## 2026-11-09 — Xong T032: README, kiểm tay quickstart và đo đạc SC-001 đến SC-009

- **Commit mã nguồn đã đọc:** `da8ffbe` (sau T036 #41).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (cập nhật dòng T032 thành Xong kèm số đo 9 tiêu chí thành công SC-001 đến SC-009), `docs/wiki/log.md`.
- **Ngoài wiki:** viết lại `README.md` (mô hình lõi/gói/kênh, một cửa gửi `core/gate.js`, router `core/registry.js`, 11 lệnh nhân viên, contract gói `specs/001-nen-tang-chung/contracts/pack.md`, các biến môi trường lõi khớp `.env.example`, yêu cầu Node >= 22.13), thêm test regression `test/core/readme-t032.test.mjs`, đối chiếu và xác minh `specs/001-nen-tang-chung/quickstart.md`, tick hoàn thành ô T032 trong `specs/001-nen-tang-chung/tasks.md`.
- **Vì sao:** hoàn tất spec 001 nền tảng dùng chung; chuẩn hoá toàn diện tài liệu kỹ thuật, hướng dẫn vận hành, đồng bộ biến cấu hình và đo đạc thực tế nghiệm thu toàn bộ 9 tiêu chí thành công (SC-001 đến SC-009).
- **Kiểm tra:** `npm test` 703 test xanh (669 test `node:test` + 34 test `test/test.mjs`), `npm run eval` 12/12 kịch bản đạt, `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).

## 2026-11-07 — Thêm thẻ nghiên cứu 010: giao việc cho thợ ngoài (Antigravity, Muse Code)

- **Commit mã nguồn đã đọc:** `0842386` (code không đổi trong đợt này; chỉ thêm thẻ spec và sửa tài liệu).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (mục 3 thêm dòng spec 010 và đổi tiêu đề mục thành
  "Spec 007, 008, 009, 010"; mục 7 ghi 5 câu chờ chủ repo chốt), `docs/wiki/log.md`.
- **Ngoài wiki:** thêm `specs/010-giao-viec-antigravity/spec.md` (thẻ nghiên cứu, chưa code);
  `docs/ROADMAP.md` thêm một dòng cho spec 010 với trạng thái "nghiên cứu, chưa code".
- **Vì sao:** anh Thắng yêu cầu nghiên cứu cách Claude Code giao việc cho thợ ngoài cho mượt, để dùng thêm
  hạn mức của nhà cung cấp khác khi gói Anthropic Ultra hết hạn mức giữa phiên. Trong phiên, phạm vi được mở rộng
  từ một nhà cung cấp (Antigravity CLI `agy` của Google) sang hai (thêm Muse Code `muse` của Meta). Hai bên dùng
  **chung một hợp đồng giao việc** nên gộp một thẻ, đúng Điều VI. Tên thư mục giữ theo nhà cung cấp khảo sát đầu tiên
  và có ghi chú ngay dưới tiêu đề thẻ.
- **Chốt trong thẻ:** mặt tiếp xúc với Claude Code là **một MCP server stdio tự viết**, phơi một tool
  `giao_viec_tho` có tham số chọn nhà cung cấp; bên dưới gọi chế độ không tương tác của từng bên. Đã loại ACP,
  Remote Control và SDK của cả hai nhà cung cấp (thêm phụ thuộc, phá Điều VI), và chốt **không cài MCP server
  của bên thứ ba** (Điều IX, VII, VI).
- **Điểm nặng nhất:** cả hai nhà cung cấp đều có đường báo xong mà chưa xong. Antigravity: việc cần duyệt mà
  headless không xin được thì bị "soft-denied" nhưng **vẫn exit 0**, không có trường nào trong kết quả báo điều đó.
  Muse Code: chính tài liệu Meta cảnh báo agent có thể kết thúc lượt với exit 0 mà test vẫn đỏ, và bảo phải tự gác
  bằng lệnh test riêng. Vì vậy cổng chấm quyết định phải là **hiện vật** (`git status --porcelain` trong worktree
  riêng của việc) chứ không phải mã thoát — đúng Điều VII và Điều IV.
- **Hai rủi ro riêng của Muse Code, ghi thành mục riêng trong thẻ:** biến API key **ghi đè** đăng nhập gói thuê bao
  nên một biến lọt vào môi trường là âm thầm đổi túi tiền sang trả theo token; và chế độ góp dữ liệu huấn luyện
  **bật mặc định** trên gói thuê bao. Thẻ buộc server phải xoá biến đó khỏi tiến trình con, in rõ đang tiêu túi tiền nào,
  và luôn tắt chế độ góp dữ liệu — Điều IX.
- **Ba điểm đã kiểm chứng, ghi lại để người sau không mắc lại:** `agy` **không** phơi ra MCP server (nó chỉ *tiêu thụ*
  MCP; Muse Code cũng vậy), gói npm `antigravity-for-claude-code` **không tồn tại**, và Claude Code khai MCP bằng
  tệp *.mcp.json* của repo hoặc lệnh `claude mcp add` chứ không bằng tệp cấu hình của Claude Desktop.
- **Chưa đổi hành vi bot:** không sửa `core/`, `packs/`, `channels/`, `eval/`; đây là thẻ nghiên cứu về công cụ dev,
  không nằm trong đường chạy của bot. Bảng "Khớp Hiến pháp" của thẻ kết luận **không cần sửa Hiến pháp**.
- **Kiểm tra:** `node scripts/kiem-wiki.mjs` ĐẠT (16 trang); `npm test` 363 + 34 test xanh và `npm run eval` 9/9 đạt
  tại commit `0842386` (không đổi code nên số test không đổi).

## 2026-11-07 — Vá lỗi do kiểm thử phát hiện sau T016: nạp gói theo tệp mã nguồn, câu báo lỗi có màu

- **Commit mã nguồn đã đọc:** `0842386` (trên đó là `5a78ff1`); cả hai nằm sau `6a9cf5e` (T016).
- **Trang wiki đã sửa:** `docs/wiki/an-toan.md`, `docs/wiki/du-lieu.md`, `docs/wiki/goi-nghiep-vu.md`,
  `docs/wiki/index.md`, `docs/wiki/kiem-thu.md`, `docs/wiki/kien-truc.md`, `docs/wiki/log.md`,
  `docs/wiki/luong-tin-nhan.md`, `docs/wiki/nao-ai.md`, `docs/wiki/nen-tang-zalo.md`,
  `docs/wiki/quan-he-vps-201.md`, `docs/wiki/su-co-bai-hoc.md`, `docs/wiki/thuat-ngu.md`,
  `docs/wiki/tien-do.md`, `docs/wiki/tong-quan.md`, `docs/wiki/trien-khai-van-hanh.md`.
- **Vì sao:** đây **không** phải việc mới mà là **vá lỗi do vai kiểm thử phát hiện sau khi T016 đã nối xong**,
  nên wiki phải đối chiếu lại chứ không chỉ thêm mục mới. Cụ thể:
  (1) `5a78ff1` — `server.js` nạp gói bằng đường dẫn tương đối `packs/`, tức phụ thuộc thư mục làm
  việc; nay dùng `join(import.meta.dirname, 'packs')` nên việc nạp gói không phụ thuộc thư mục làm
  việc (`server.js:72`), và thêm cảnh báo **to** khi không nạp được gói nào thay vì im lặng
  (`server.js:74`). (2) `0842386` — câu báo lỗi chung của lõi mất thẻ màu `{orange}` so với đường cũ;
  đã khôi phục nguyên văn (`core/engine.js:13`).
- **Sửa cả nội dung, không chỉ số dòng:** (1) Vì hai commit trên làm dòng trong `server.js` dịch
  (dòng `VERSION` gộp vào dòng 25; các dòng 27–73 lùi 1; khối dựng engine gộp còn một dòng ở
  `server.js:76`), mọi trích dẫn
  `server.js:N` trong wiki đã đối chiếu lại với tệp thật. (2) Bốn test mới trong
  `test/core/one-gate.test.mjs` và `test/core/engine.test.mjs` làm số test tăng từ 270 lên 274; số
  liệu trong trang tiến độ và trang kiểm thử đã cập nhật, khối output được chép nguyên văn từ lần
  chạy mới. (3) Trang kiến trúc, trang não AI và trang triển khai vận hành được thêm ghi chú về việc
  nạp gói không phụ thuộc thư mục làm việc và về câu báo lỗi có thẻ màu `{orange}`.
- **Lưu ý về cổng kiểm:** `scripts/kiem-wiki.mjs` chỉ bắt trích dẫn **vượt quá độ dài tệp**, không bắt
  trích dẫn lệch dòng; vì vậy phần lớn việc trong đợt này là đối chiếu tay theo tệp thật.
- **Kiểm tra:** `npm test` 274 test xanh và `npm run eval` 7/7 đạt tại commit `0842386`;
  `node scripts/kiem-wiki.mjs --nghiem` ĐẠT.

## 2026-11-07 — Xong T016: nối `server.js` vào lõi `core/`, xoá thư mục `lib/`

- **Commit mã nguồn đã đọc:** `0842386` (T016 xong ở `6a9cf5e`; vá lỗi ở `5a78ff1` và `0842386`).
- **Trang wiki đã sửa:** `docs/wiki/an-toan.md`, `docs/wiki/du-lieu.md`, `docs/wiki/goi-nghiep-vu.md`,
  `docs/wiki/index.md`, `docs/wiki/kiem-thu.md`, `docs/wiki/kien-truc.md`, `docs/wiki/log.md`,
  `docs/wiki/luong-tin-nhan.md`, `docs/wiki/nao-ai.md`, `docs/wiki/nen-tang-zalo.md`,
  `docs/wiki/quan-he-vps-201.md`, `docs/wiki/su-co-bai-hoc.md`, `docs/wiki/thuat-ngu.md`,
  `docs/wiki/tien-do.md`, `docs/wiki/tong-quan.md`, `docs/wiki/trien-khai-van-hanh.md`, `README.md`.
- **Vì sao:** T016 nối lõi `core/` vào chương trình chính và xoá hẳn thư mục `lib/`. Trước đó repo
  có **hai** đường xử lý: đường cũ ở `lib/` và đường lõi ở `core/`, mà nhiều trang wiki vẫn mô tả
  theo kiểu "đường đang chạy" / "lõi mới chưa nối". Nay chỉ còn **một** đường: `server.js` nối
  thẳng vào lõi (`server.js:76`), gọi `gate.recover()` lúc khởi động (`server.js:77`), và chỉ
  `core/gate.js:79` gọi `channel.sendText` trong toàn bộ tệp sản xuất — nguyên tắc này được khoá
  bằng test `test/core/one-gate.test.mjs:167`. Vì vậy các trang phải viết lại phần mô tả: bỏ mô
  hình hai đường, bỏ mục "đường đang chạy (RAM)" trong trang dữ liệu, bỏ câu "lõi dùng chung hiện
  chưa có tác dụng" trong trang triển khai (nay mọi biến môi trường đều ảnh hưởng khách thật),
  và đổi số dòng mọi trích dẫn trỏ vào tệp đã bị xoá (mcp, bot, truot và tinh-hieu trong thư mục
  lib cũ) sang tệp thay thế (`core/mcp.js`, `core/mention.js`, `core/engine.js`,
  `packs/hs/miss-log.js`, `scripts/giam-sat/tinh-hieu.js`).
- **Sửa cả nội dung, không chỉ số dòng:** (1) Trang an toàn: điều I nay **đã có** test khoá
  (`test/core/one-gate.test.mjs:167`), mục "chưa có tệp test" bị bỏ; điều VII ghi `recover()`
  được gọi thật tại `server.js:77`. (2) Trang kiểm thử: bỏ giới hạn cũ "chưa có test bảo chứng
  một cửa gửi" — nay đã có; cập nhật số tệp test và số test đạt. (3) Trang nền tảng Zalo §10: mô tả
  cũ nói đường cũ trả khách **120 ký tự đầu lỗi gốc** — đối chiếu lịch sử code cho thấy đường cũ
  từng trả kèm lỗi gốc, nhưng lỗi đó đã được vá trước khi thư mục bị xoá; đã viết lại cho đúng
  thứ tự thời gian, không ghi "chưa xác minh" cho điều đã đọc code. (4) Trang triển khai và vận hành: giám sát nay đọc `bot.db` có dữ liệu thật nên mục
  "mâu thuẫn vận hành" đổi thành "dữ liệu giám sát giờ phản ánh hoạt động thật". (5) Trang tiến độ:
  T016 chuyển sang **Xong** kèm bằng chứng; các ghi chú cũ nói lõi chưa nối được ghi lại là lịch sử.
  (6) Ba trang còn sót: trang não AI sửa lại số dòng `server.js` và câu "não AI hiện chỉ nối ở đường đang
  chạy" — nay não **đã** được nối vào lõi đang chạy; trang quan hệ VPS 201 bỏ `lib/` khỏi danh sách mã;
  trang sự cố và bài học đổi câu "hai đường xử lý" thành "một đường xử lý".
- **Kiểm tra:** `npm test` 274 test xanh và `npm run eval` 7/7 đạt tại commit `0842386`
  (lần chạy gần nhất trong phiên sửa wiki này); `node scripts/kiem-wiki.mjs --nghiem` ĐẠT.

## 2026-11-07 — Phản ánh hai quyết định ngày 06/11 của chủ repo

- **Commit mã nguồn đã đọc:** `ef2b48f` (code không đổi trong đợt này; chỉ sửa tài liệu).
- **Lý do:** phản ánh hai quyết định của chủ repo ngày 06/11 mà repo chưa có:
  hiến pháp Điều II cho phép phòng `human` tự trở về `bot` sau khoảng lặng lâu,
  và thứ tự làm spec 003 trước 002.
- **Ngoài wiki:** hiến pháp lên phiên bản 2.0.0 và thêm mục lịch sử sửa đổi
  (`.specify/memory/constitution.md`); `specs/001-nen-tang-chung/spec.md`,
  `specs/001-nen-tang-chung/tasks.md`, `specs/001-nen-tang-chung/data-model.md`,
  `specs/001-nen-tang-chung/research.md` khớp Điều II mới; `docs/ROADMAP.md` thêm "003 trước 002".
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md`, `docs/wiki/an-toan.md`, `docs/wiki/su-co-bai-hoc.md`.
- **Chưa có code:** luật tự trở về sau khoảng lặng thuộc việc T022, chưa viết; đường đang chạy không đổi gì.
- **Kiểm tra:** `npm test`, `npm run eval`, `node scripts/kiem-wiki.mjs --nghiem` đều đạt.
## 2026-11-07 — Xong T038 (issue #27): gắn đúng tên trong nhóm, tách người trùng tên

- **Commit mã nguồn đã đọc:** `6e94671`. Lưu ý: code T038 còn ở working tree, **chưa có commit riêng**.
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md`, `docs/wiki/luong-tin-nhan.md`, `docs/wiki/log.md`.
- **Ngoài wiki:** `specs/001-nen-tang-chung/tasks.md` (tick ô Step 1 của T038, thêm ghi chú cho T019).
- **Vì sao:** T038 gắn tên người nhận ở đầu mọi tin ra trong nhóm; người trùng tên trong nhóm được phân biệt bằng hậu tố 2 ký tự cuối `userId` (FR-031, `core/mention.js:29`). Lõi tính `namePrefix` khi xử lý lượt (`core/engine.js:82`) và gắn lại tên lúc gửi kết quả việc nền (`core/jobs.js:84` — tệp này tên cũ là *core/engine-jobs.js*, tách ra ở T021). Bảng `convs` thêm `listByChat` để lấy danh sách người đã từng nhắn trong nhóm (`core/store/state.js:35`). Test nằm ở `test/core/group-tag.test.mjs`.
- **Kiểm tra:** `npm test` 254/254 đạt (cộng 34 test cũ ở `test/test.mjs`), `npm run eval` 7/7
  kịch bản đạt, `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).

## 2026-11-07 — Xong T037 (issue #26): cuộc trò chuyện riêng trong nhóm, khoá `conv_id`

- **Commit mã nguồn đã đọc:** `1316cfe`. Sáu commit trên `main`: `fd436d0`, `f4e7a4a`, `e6162b2`
  (feat) rồi `278f833`, `009c7d6`, `1316cfe` (fix).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md`, `docs/wiki/du-lieu.md`, `docs/wiki/an-toan.md`,
  `docs/wiki/kiem-thu.md`, `docs/wiki/kien-truc.md`, `docs/wiki/luong-tin-nhan.md`,
  `docs/wiki/thuat-ngu.md`, `docs/wiki/tong-quan.md`, `docs/wiki/trien-khai-van-hanh.md`,
  `docs/wiki/log.md`.
- **Ngoài wiki:** `specs/001-nen-tang-chung/tasks.md` (tick ô Step 1 của T037),
  `specs/001-nen-tang-chung/data-model.md`, `specs/001-nen-tang-chung/contracts/send-gate.md`.
- **Vì sao:** T037 đổi khoá của mọi thứ theo người sang `conv_id` — chat 1-1 thì `conv_id = chat_id`,
  trong nhóm thì `conv_id = chat_id:user_id` (`core/conv.js:10`). Trạng thái "người cầm phòng"
  nay đọc theo người qua `effectiveState` (`core/gate.js:22`): `chats.state = 'blocked'` chặn cả
  nhóm, còn `human`/`blocked` ở bảng `convs` chỉ chặn đúng người đó. Lược đồ có bảng `convs` và cột
  `conv_id` ở `outbox`, `jobs`, `tickets`, `messages`, `audit`; `customers` khoá theo `conv_id`
  (`core/store/schema.js:17`). Cửa có thêm luật trần ngày của nhóm `cap:group`
  (`CAP_GROUP_DAY=200`, `core/gate-decide.js:97`). Vì vậy các trang wiki và spec phải đồng bộ lại:
  số bảng, số chỉ mục, danh sách `facts`, thứ tự kiểm của cửa, khoá idempotency và cách đọc
  trạng thái phòng.
- **Kiểm tra:** `npm test` 249/249 đạt (cộng 34 test cũ ở `test/test.mjs`), `npm run eval` 7/7
  kịch bản đạt, `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang).

## 2026-11-07 — Vá câu báo lỗi gửi khách (issue #23), sửa trang an toàn

- **Commit mã nguồn đã đọc:** `ef2b48f`. Lưu ý: thay đổi code của issue #23 (sửa tệp lib/bot.js, dòng trả câu báo kèm lỗi gốc,
  thêm `test/core/loi-goc-khach.test.mjs`) còn nằm ở working tree, **chưa có commit riêng**.
- **Trang wiki đã sửa:** `docs/wiki/an-toan.md`, `docs/wiki/kiem-thu.md`, `docs/wiki/log.md`.
- **Vì sao:** đường đang chạy trước đây kèm lỗi gốc vào câu báo gửi khách (in 120 ký tự đầu của
  `e.message`), khách thật nhận được lỗi gốc — vi phạm Hiến pháp Điều IX
  (`.specify/memory/constitution.md:50`). Sau khi sửa, câu báo gửi khách không còn kèm lỗi gốc,
  chi tiết chỉ vào log. Trang an toàn được cập nhật cho khớp: chuyển nhận định "không kèm lỗi gốc"
  của đường đang chạy từ "Chưa có code" sang "Đã có code" (kèm test khoá), bổ sung dòng log
  trong lib/bot.js vào khoảng trống log chưa che, đổi ô Điều IX trong bảng tổng quan thành
  "có phần", và bỏ mục rủi ro "Câu báo lỗi của đường đang chạy kèm lỗi gốc". Trang kiểm thử
  cập nhật số liệu cho khớp sau khi thêm test: 23 tệp test (17 trong `test/core/`), `npm test`
  226/226 đạt, thêm tệp test mới vào bảng `test/core/` và cập nhật mục "Kết quả chạy gần nhất".
  Sau đó tệp `test/core/loi-goc-khach.test.mjs` được viết lại (135 dòng) thành 3 ca test khoá cả ba
  nhánh lỗi của đường đang chạy — nhánh chạy gói, nhánh mở lại lượt (`ket-qua`) và nhánh đọc ảnh
  (`test/core/loi-goc-khach.test.mjs:101-135`). Trang an toàn và trang kiểm thử đã đồng bộ lại
  trích dẫn theo dòng mới, số test tăng lên 226; trang kiểm thử đã cập nhật số liệu "Kết quả chạy
  gần nhất" thành 226/226 và tổng 260 test.

## 2026-11-07 — Đưa wiki thành cửa vào; sửa trích dẫn

- **Commit mã nguồn đã đọc:** `64a728a` (code không đổi trong đợt này; chỉ sửa tài liệu).
- **Trang wiki đã sửa:**
  - `docs/wiki/luong-tin-nhan.md`: sơ đồ đường A ghi `server.js:67` cho bước `JSON.parse`; dòng đúng là `server.js:69` (`server.js:67` là `req.on('end', ...)`).
  - `docs/wiki/an-toan.md`: kiểm lại Điều VI — đã trỏ đúng `package.json:8`, không cần sửa.
- **Ngoài wiki:** thêm giao thức đầu phiên / cuối phiên vào `AGENTS.md`; thêm dòng cảnh báo tài liệu cũ ở đầu `docs/TIEP-TUC.md`.

## 2026-11-12 (nhịp chiều) — OZV-430 điểm 1 vòng soát 2: tách hai ngữ cảnh đọc mã nước

- **Nhánh:** `ozv-430-don-no-packs-hs`, commit `6d203dd`, PR #214 (chờ giám đốc soát lại).
- **Vì sao có vòng 2:** giám đốc CHẶN bản vá đầu. Bản đầu dùng MỘT danh sách 56 mã viết tay
  (`MA_NUOC_BIET`) cho cả hai ngữ cảnh đọc mã nước, nên bác bỏ 12 nước CÓ FTA với Việt Nam
  (`SK SI BG HR LT LV EE LU MT CY` của EVFTA, `BN` ATIGA/CPTPP, `IS`). Khách gõ "84137090 SK"
  thì bot tra thuế **Trung Quốc** và còn nói "giả định" — nặng hơn bệnh đang chữa, vì sai sang
  một nước CÓ THẬT, có FTA khác, nên Cổng trả về con số trông như thật.
- **Đổi hành vi:** tách hai ngữ cảnh trong `packs/hs/input.js` — ô khai riêng một mã chấp bảng
  ISO-3166-1 alpha-2 đầy đủ (`MA_ISO2`, 249 mã); mã lẫn giữa chữ khác đi `maNuocTrongCau` với ba
  rào hình/tên/vị trí. Gói 6 (`packs/hs/packages.js:602`) thôi đẩy mã cuối câu tự do qua
  `countryCode`. Chi tiết và lý do từng chỗ: `docs/wiki/tien-do.md` (dòng OZV-430 điểm 1).
- **Trang wiki đã sửa:** `docs/wiki/tien-do.md` (dòng OZV-430 điểm 1 — ghi lại gốc lỗi, cách tách
  hai ngữ cảnh, và lý do KHÔNG dùng ISO đầy đủ cho cả hai); `docs/wiki/an-toan.md` (số dòng thật
  của `packs/hs/packages.js`: 665 → 669, cho khớp cổng kiểm wiki).
- **Bài học ghi lại (để lần sau không mắc lại):** bản vá kiểu **danh sách cho phép** thì BẮT BUỘC
  có ca test "có thật mà ngoài danh sách" — đó là chỗ allowlist luôn hỏng. Bộ 22 ca của vòng 1 chỉ
  gồm thứ bản vá nhắm tới (mã rác + 11 nước trong từ điển `tenNuoc`) nên không bắt được. Cách đo
  bắt ra lỗi: chạy **cùng một script** trên worktree nhánh và `origin/main` rồi so bảng.
- **Cổng máy:** `npm test` 1269/1269 (+34 test đạt) · `npm run eval` 32/32 · `node scripts/qa-that.mjs --mock`
  6/6 · `node scripts/kiem-wiki.mjs --nghiem` ĐẠT (16 trang). CI PR #214 xanh hai job trên `6d203dd`.

## 2026-11-07 — Tạo wiki lần đầu

- **Commit mã nguồn đã đọc:** `64a728a` (nhánh main).
- **Trang tạo mới (15 trang):** index.md, tong-quan.md, kien-truc.md, luong-tin-nhan.md,
  goi-nghiep-vu.md, nao-ai.md, du-lieu.md, an-toan.md, nen-tang-zalo.md,
  trien-khai-van-hanh.md, kiem-thu.md, tien-do.md, su-co-bai-hoc.md, thuat-ngu.md, log.md.
- **Nguồn:** đọc trực tiếp mã nguồn, không sao chép tài liệu cũ. Mọi nhận định về code
  đều kèm đường dẫn tệp và số dòng để người đọc mở ra kiểm.
- **Điểm đáng chú ý ghi lại trong trang tiến độ:** repo có hai đường xử lý.
  Lõi mới trong thư mục core đã xong phần nền (T001–T015) nhưng **chưa** được nối vào
  điểm vào của tiến trình; đường đang chạy vẫn là đường cũ trong thư mục lib, tự gửi tin
  không qua cửa gửi. Mọi tính năng an toàn của lõi vì thế chưa có tác dụng với khách thật.
- **Mâu thuẫn tài liệu ↔ code:** ghi cả hai phía trong trang tiến độ, không tự chọn bên nào đúng.
- **Quyết định của chủ repo ngày 06/11:** chỉ **ghi nhận** trong trang tiến độ, không sửa
  hiến pháp hay lộ trình. Việc sửa chính thức là một PR riêng, do chủ repo quyết.
- **Kiểm tra:** chạy `node scripts/kiem-wiki.mjs --nghiem` phải đạt; CI cũng chạy cổng này.
