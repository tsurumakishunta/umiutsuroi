# 海うつろい — Umiutsuroi

朝から夜へ移ろう空と、光を映す青い海を静かに眺めるリアルタイム3D体験です。

**Live demo:** [tsurumakishunta.github.io/umiutsuroi](https://tsurumakishunta.github.io/umiutsuroi/)

## Features

- 沖縄の海をイメージした透明感のある青と浅瀬
- 朝・昼・夕・夜へ滑らかに移り変わる空
- 空の色を反射するリアルタイムの水面
- 60秒周期で穏やかさと力強さが変化する波
- 波頭に発生する白波と、星空に照らされる夜の海
- Full HD相当の高解像度背景と滑らかな星
- 操作画面を持たず、ただ海を眺めるための体験

## Built with

- [Three.js](https://threejs.org/)
- React
- TypeScript
- Vite

## Local development

Node.js 22以降を用意して、次のコマンドを実行します。

```bash
npm install
npm run dev
```

本番用ファイルを作成する場合は、次を実行します。

```bash
npm run build
```

## GitHub Pages

`main` ブランチへ変更が入ると、GitHub Actionsが自動的にビルドしてGitHub Pagesへ公開します。

## License

[MIT License](LICENSE)
