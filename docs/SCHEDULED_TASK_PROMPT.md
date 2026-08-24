# Scheduled Task Prompt 鈥� Search, Images, Archive, and Publish

Use the following prompt to update both existing ChatGPT tasks. Keep their current schedules and enabled state; do not create duplicate tasks.

```text
璇峰崌绾х幇鏈夆€滄父鎴忓湀鍙屾椂娈电儹鐐圭畝鎶モ€濆畾鏃朵换鍔＄殑妫€绱笌 GitHub 鍙戝竷娴佺▼銆備繚鐣欏綋鍓嶆棭鎶ユ瘡澶�10:10銆佹櫄鎶ユ瘡澶�17:00銆丄sia/Shanghai銆佽繛缁湡鍙枫€佹椂闂寸獥鍙ｃ€佷竴鎵嬫潵婧愭牳楠屻€佺浉閭绘湡鍘婚噸鍜岃拷鍔犲紡褰掓。瑙勫垯锛涙洿鏂扮幇鏈変袱涓换鍔★紝涓嶈鍒涘缓閲嶅浠诲姟銆�

涓€銆佹绱笌鏍忕洰
1. 鍏堣鍙栦粨搴� main 鐨� public/data/manifest.json 涓� latest.json锛岀‘瀹氫笅涓€鏈熷彿銆佺浉閭绘湡鍐呭鍜屾湰娆¤鍒掔獥鍙ｃ€�
2. 鎸夊彂鍞笌涓婄嚎銆佽瘎鍒嗐€佺儹鐐规柊闂汇€佸叕鍙镐笌浜т笟銆佹繁搴︽枃绔犱笌涓撹銆佹硠婕忎笌浼犻椈銆佸欢浼歌瀵熷垎鍒绱紝浣嗕笉寰椾负浜嗗～婊℃爮鐩€岄檷浣庝簨瀹炴垨鏉ユ簮鏍囧噯銆�
3. 鏌愭爮鐩病鏈夊彲闈犳柊澧炴椂锛屼笉鍐欏崰浣嶆潯鐩€佷笉缂栧啓姒傛嫭鎬х┖鏂伴椈锛涗繚鐣欑┖鏁扮粍鎴栦笉浜х敓璇� section 鐨勬潯鐩紝缃戦〉浼氳嚜鍔ㄩ殣钘忕┖鏍忕洰銆�
4. 缁х画鎵ц鍖椾含鏃堕棿绐楀彛銆佽ˉ閬楁爣璁般€佸畼鏂逛腑鏂囧悕鐘舵€併€乫act_status銆乼ime_status銆佷竴鎵嬫潵婧愬拰鏍囬褰掍竴鍖栬鍒欍€傚彧鏈変翰鑷墦寮€涓€鎵嬫潵婧愬悗鎵嶈兘鏍囪 official銆�
5. 涓烘湰鏈熺敓鎴� archiveTitle 鍜� leadEntryId銆俛rchiveTitle 蹇呴』浠モ€滄棭鎶ワ綔鈥濇垨鈥滄櫄鎶ワ綔鈥濆紑澶村苟涓� period 涓€鑷达紝鎬婚暱8鈥�40涓瓧绗︼紱浠庢湰鏈熺湡瀹炴潯鐩腑閫夋嫨閲嶈娓告垙銆佸ぇ鍨嬪巶鍟嗘垨骞冲彴銆佺儹璁笖鏈変俊鎭閲忕殑浜嬩欢浣滀负鏍囬銆備笉寰楁妸鏈瘉瀹炰紶闂诲啓鎴愭棦瀹氫簨瀹烇紝涓嶅緱浣跨敤绌烘硾鍙ｅ彿鎴栤€滄父鎴忔棭鎶�/娓告垙鏅氭姤鈥濊繖绫绘棤淇℃伅鏍囬銆俵eadEntryId 蹇呴』鎸囧悜琚€変腑鐨勬湰鏈� entry銆�

浜屻€佸浘鐗�
1. 鏂扮畝鎶ヤ娇鐢� schemaVersion: 2銆備负姣忔潯鏂伴椈涓诲姩瀵绘壘涓庤浜嬩欢鐩存帴鐩稿叧鐨勫畼鏂规柊闂诲浘銆佸彂琛屽晢濯掍綋绱犳潗銆佸紑鍙戝晢鎴浘鎴栧畼鏂瑰晢搴楃礌鏉愶紱鏈潵15澶╂父鎴忎紭鍏堜娇鐢ㄥ畼鏂瑰皝闈€€�
2. 鏈夊悎瑙勫浘鐗囨椂濉啓 images 鎴� cover銆傛瘡涓浘鐗囧璞″繀椤诲寘鍚細
   - url锛氫紭鍏堜笂浼犲埌 public/media/briefs/YYYY/MM/<edition-id>/<entry-or-game-id>.webp 鎴� .jpg锛孞SON 浣跨敤涓嶄互鏂滄潬寮€澶寸殑 media/briefs/... 璺緞锛涙棤娉曚笂浼犱簩杩涘埗鏃跺彲浣跨敤宸查獙璇佸彲璁块棶鐨勫畼鏂� HTTPS 濯掍綋/CDN 鍦板潃銆�
   - alt锛氬噯纭弿杩板彲瑙佸唴瀹圭殑涓枃鏇夸唬鏂囨湰銆�
   - credit锛氬紑鍙戝晢銆佸彂琛屽晢銆佹憚褰卞笀鎴栫増鏉冩柟銆�
   - sourceUrl锛氬凡浜茶嚜鎵撳紑鏍搁獙鐨勫畼鏂瑰浘鐗囨潵婧愰〉闈紝蹇呴』涓� HTTPS銆�
   - kind锛氭柊闂讳负 editorial锛屽皝闈负 cover銆�
3. 鏂伴椈鍥炬寜16:9銆佹父鎴忓皝闈㈡寜3:4閫夋嫨锛屼粨搴撴枃浠跺敖閲忎娇鐢╓ebP/JPEG骞舵帶鍒跺湪500KB浠ヤ笅銆�
4. 绂佹浣跨敤鎼滅储缁撴灉缂╃暐鍥俱€佹棤鍏冲浘搴撶収鐗囥€佺矇涓濆垱浣溿€佹棤娉曡拷婧潵婧愮殑鍥剧墖锛岀姝负浜嗘弧瓒斥€滄瘡鏉℃湁鍥锯€濊€屽己琛岄敊閰嶃€�
5. 濡傛灉缁忚繃妫€绱粛娌℃湁鍙牳瀹炪€佺浉鍏充笖閫傚悎浣跨敤鐨勫浘鐗囷細鏂伴椈鐪佺暐 images锛屽啓 image_status: "unavailable" 涓庡叿浣� imageNote锛涙父鎴忕渷鐣� cover锛屽啓 cover_status: "unavailable" 涓庡叿浣� coverNote銆備笉寰椾吉閫犲浘鐗囷紝涔熶笉寰楀洜姝ら檷鍥� schemaVersion: 1銆�
6. 本轮起，商店和官方网站只作为优先来源，不是唯一来源；若这些链路没有合适图片，继续在互联网执行图片搜索。必须打开结果原始网页并使用原图，禁止直接使用搜索缩略图。封面不再限定3:4或方形，填写实际 aspect 并保持原始比例；方形、竖版、横版均可。
7. 中文游戏名可采用官方译名、广泛流传的民间译名或已有共识的趣味译名。非官方译名必须写 title_zh_status: "common_translation"，不得标为官方；不要为了等待官方中文名而只显示不易识别的英文名。
8. 游戏封面的 credit 与 sourceUrl 继续保留在 JSON 中用于追溯，但网页前台不显示封面“图源”字幕。

涓夈€佸師瀛愬彂甯�
1. 濡傛湁鏈湴濯掍綋锛屼笂浼犲埌 public/media/briefs/YYYY/MM/<edition-id>/銆�
2. 鏂板 public/data/archive/YYYY/MM/<edition-id>.json銆�
3. 璁� public/data/latest.json 涓庢柊褰掓。 JSON 瀹屽叏涓€鑷淬€�
4. 鍙拷鍔� public/data/manifest.json锛屾洿鏂� latest 鍜� updatedAt锛涙柊 manifest item 蹇呴』澶嶅埗鏈湡 archiveTitle 涓� leadEntryId銆備笉寰楀垹闄ゃ€佹敼鍙枫€佹敼鍐欐爣棰樻垨瑕嗙洊鏃у綊妗ｃ€�
5. 涓嶈鎵嬪伐缁存姢 public/data/search-index.json锛沶pm 鏋勫缓浼氭牴鎹叏閮ㄥ綊妗ｈ嚜鍔ㄧ敓鎴愯法鏈熸悳绱㈢储寮曘€�
6. 杩愯 npm run validate:data 鍜� npm run check銆備换浣曞け璐ラ兘鍏堜慨澶嶏紝涓嶅緱鎺ㄩ€佸崐鎴愬搧銆�
7. 鎺ㄩ€� main 鍚庣瓑寰� GitHub Actions 鎴愬姛锛岄獙璇佺嚎涓� latest.json銆佸綋鏈熷綊妗ｃ€乵anifest銆佹悳绱㈢储寮曚互鍙婃墍鏈夊疄闄呬娇鐢ㄧ殑鍥剧墖 URL 鍧囪繑鍥� HTTP 200銆�
8. 鍙湁浠ヤ笂楠岃瘉鍏ㄩ儴閫氳繃鍚庢墠鎶ュ憡鍙戝竷鎴愬姛锛屽苟鍒楀嚭鎻愪氦銆丄ctions銆佹湡娆′笌绾夸笂鍦板潃銆�

鑻� GitHub銆佹潵婧愭垨鍥剧墖涓婁紶鍙楅檺锛屾槑纭姤鍛婂彈闄愰」鐩€傛病鏈夊悎瑙勫浘鐗囦笉闃绘鏂伴椈鍙戝竷锛屼絾蹇呴』浣跨敤 unavailable 鐘舵€佽鏄庯紝缁濅笉鑳界敤鏃犲叧鍥剧墖鏇夸唬銆�
```

The repository-side contract remains authoritative in `AGENTS.md`, `docs/DATA_PIPELINE.md`, and `scripts/validate-data.mjs`.


## Current relaxed cover rule (authoritative)

- Storefront and official-site order is a reliability preference, not an eligibility gate.
- Accept square, portrait, or landscape art and record the real aspect. Do not reject a valid official banner or key art merely because it is not 3:4 or square.
- Valid same-title assets include official covers, storefront banners, publisher key art, official screenshots, and Steam header art.
- When official paths fail, reputable media reports, reliable retailers, or recognized game databases may provide same-title artwork only after opening the exact source page, checking the game/edition match, and identifying the real rights holder. Download to the repository when possible; do not hotlink third-party hosts by default.
- Search thumbnails, fan art, unrelated images, watermarked composites, and assets without an accessible source page remain forbidden.
- Keep url, Chinese alt, rights-holder credit, HTTPS sourceUrl, kind:"cover", actual aspect, and cover_status:"verified".
