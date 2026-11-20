# AxisTree

ローカルのファイル（Markdown・画像・PDF・その他あらゆるファイル）に、複数の独立した **階層付き分類軸（Axis）** を付けて、軸を切り替えながら閲覧・管理するデスクトップアプリです。

```
note_1.md
  Date    : 2026 / 11 / 20
  Project : Project_A / chapter_1
  Content : Study / CFD
```

左ペインで `Date | Project | Content | 物理フォルダ` を切り替えると、その軸のフォルダツリーが動的に生成されます。ファイル本体は移動せず、分類情報はワークスペース直下の `.axistree.json` に保存されます。

## 機能

- **ワークスペース**: 任意のフォルダを開き、再帰スキャンします（`.git`・`node_modules`・隠しファイルは除外）。前回開いたフォルダは次回起動時に自動で開き、ファイルの追加・削除・変更も監視して反映します。
- **多次元エクスプローラー（左）**: 軸タブの切り替え、折りたたみツリー、件数バッジ、ファイル名での絞り込み、すべて展開／折りたたみ。分類のないファイルは `(未分類)` にまとめて表示します。
- **プレビュー＆エディタ（中央）**
  - Markdown: 編集／分割／プレビューの切り替えと自動保存（600ms）。`Ctrl+S` で即時保存でき、ウィンドウを閉じる直前の未保存分も確実に書き込みます。外部で変更された場合は自動で再読込します。相対パスの画像を表示し、ファイル間リンクはアプリ内でそのファイルへ移動します。
  - 画像（png/jpg/gif/webp/svg…）と PDF をプレビューできます。
  - その他のファイルはファイル情報と「OSの既定アプリで開く」を表示します。
  - 新規 Markdown 作成（`Ctrl+N`）。ツリーで選択中の分類と、作成日の Date を自動で付与できます。
- **分類インスペクター（右）**: 軸ごとにパスを追加・編集・削除できます。`Project_A/chapter_1` のように `/` 区切りで入力し、既存の階層を候補に出します（`↑↓` で選択、`Tab` で補完して下の階層へ、`Enter` で追加）。パスの各要素をクリックすると、ツリーの該当フォルダへジャンプします。
- **Date 軸の自動化**: 新規作成時の自動付与、スキャン時の自動付与（オプション）、ワンクリック付与（作成日／更新日／今日）、未設定ファイルへの一括付与に対応しています。
- **軸の管理**: 追加・名前変更（全ファイルに反映）・並び替え・削除に加え、存在しないファイルの分類情報を整理できます。

## セットアップ

```bash
npm install
npm run dev        # 開発起動（HMR）
npm run build      # 型チェック + 本番ビルド（out/）
npm run preview    # ビルド結果で起動
npm test           # ユニットテスト（vitest）
npm run typecheck
```

必要環境: Node.js 22.12 以上

### WSL2 で動かす場合

- Electron の起動に ALSA ライブラリが必要です。`libasound.so.2: cannot open shared object file` が出たらインストールしてください。
  - Ubuntu 22.04: `sudo apt install libasound2`
  - Ubuntu 24.04: `sudo apt install libasound2t64`
- WSLg の GPU 描画では一部の SVG（アイコンの円弧）が欠けるため、WSL 上では自動でハードウェアアクセラレーションを無効にしています。有効にしたい場合は `AXISTREE_GPU=1 npm run dev` で起動してください。

## `.axistree.json`

```json
{
  "version": 1,
  "axes": ["Date", "Project", "Content"],
  "settings": {
    "dateAxis": "Date",
    "autoDateOnCreate": true,
    "autoDateOnScan": false,
    "dateSource": "birthtime"
  },
  "files": {
    "notes/note_1.md": {
      "Date": [["2026", "11", "20"]],
      "Project": [["Project_A", "chapter_1"], ["Project_B"]],
      "Content": [["Study", "CFD"]]
    }
  }
}
```

- キーはワークスペースからの相対パス（区切りは常に `/`）です。
- 1つの軸に複数のパスを持てます（上の `Project` のように）。
- 手で編集しても大丈夫です。`"Date": ["2026","11","20"]` や `"Project": "Project_A/chapter_1"` のような省略形も読み込めます。アプリ起動中に外部で編集した場合も自動で反映します。
- JSON として壊れていた場合は上書きせず、`.axistree.json.broken-<日時>` に退避してから新しく作成します。

## 構成

```
src/
  shared/    型・IPC契約・純粋ロジック（パス解析、ツリー構築、メタデータ操作）＋テスト
  main/      Electron メインプロセス（IPC、スキャン、chokidar 監視、メタデータ保存、atfile:// プロトコル）
  preload/   contextBridge で window.axistree API を公開
  renderer/  React UI（zustand ストア、Explorer / Viewer / Inspector、各ダイアログ）
```

### セキュリティ方針

- `contextIsolation: true`・`sandbox: true`・`nodeIntegration: false` で動かし、レンダラーは preload 経由の限定 API しか使えません。
- レンダラーは相対パスしか渡せません。メインプロセスで `..`・絶対パス・シンボリックリンクによるワークスペース外へのアクセスや、隠しファイルへのアクセスを拒否します。
- 画像と PDF は `atfile://` カスタムプロトコルで配信し、同じ制限をかけています。
- Markdown は生 HTML を描画しません。外部リンクは OS のブラウザで開き、アプリのウィンドウが遷移しないようにしています。

## 今後の拡張候補

- ツリー上のドラッグ＆ドロップによる分類付与
- 軸フォルダの一括リネーム（例: `Project_A` → `Proj_A` を全ファイルに反映）
- アプリ内でのファイルのリネーム・移動（分類情報の追従）
- 全文検索、軸を組み合わせたクロス絞り込み
- パッケージング（electron-builder）
