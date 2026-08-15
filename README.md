# 海うつろい — Umiutsuroi

朝のやわらかな光から、昼、夕暮れ、そして星の見える夜へ。
ゆっくり表情を変えていく空と海を、何もせずに眺めていられるリアルタイム3D作品です。

**海を眺める：** [tsurumakishunta.github.io/umiutsuroi](https://tsurumakishunta.github.io/umiutsuroi/)

## この景色について

- 澄んだ青と、海底がそっと透けて見える浅瀬
- 朝・昼・夕・夜へ、ゆるやかに移り変わる空
- 空の色や光を映しながら揺れる水面
- 60秒かけて、穏やかさと力強さを行き来する波
- 波頭にふわりと現れる白波と、星空の下でも見える夜の海
- Full HD相当の高精細な背景と、なめらかに輝く星
- ボタンも設定画面もなく、ただ海と過ごすための静かな時間

## 使っている技術

- [Three.js](https://threejs.org/)
- React
- TypeScript
- Vite

## 手元で動かす

Node.js 22以降を用意したら、次のコマンドで海を開けます。

```bash
npm install
npm run dev
```

公開用のファイルを作るときはこちらです。

```bash
npm run build
```

## GitHub Pagesでの公開

`main` ブランチに変更が入ると、GitHub Actionsが新しい景色を自動でビルドし、GitHub Pagesへ届けます。

## ライセンス

[MITライセンス](LICENSE)

---

# English

## About Umiutsuroi

Umiutsuroi is a quiet real-time 3D ocean experience that drifts gently from morning light through midday and sunset into a starry night. There are no controls or menus—just an ever-changing sea to spend a little time with.

**View the ocean:** [tsurumakishunta.github.io/umiutsuroi](https://tsurumakishunta.github.io/umiutsuroi/)

## What you will see

- Clear blue shallows with the seabed softly visible below
- A sky that eases from morning to day, sunset, and night
- A water surface that carries the colors and light of the sky
- Waves that breathe between calm and powerful over a 60-second cycle
- Soft whitecaps and a nighttime sea that remains visible beneath the stars
- A Full HD–quality backdrop with smooth, delicate starlight
- A peaceful, control-free space made simply for watching the ocean

## Built with

- [Three.js](https://threejs.org/)
- React
- TypeScript
- Vite

## Run locally

With Node.js 22 or later installed, run:

```bash
npm install
npm run dev
```

To create a production build, run:

```bash
npm run build
```

## GitHub Pages

Changes merged into the `main` branch are built and published to GitHub Pages automatically through GitHub Actions.

## License

[MIT License](LICENSE)
