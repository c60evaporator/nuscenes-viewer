## nuScenesデータセットのダウンロード方法

ここではnuScenesデータセット（本体＋Map expansion）をダウンロードし、nuscenes-viewerで読み込めるよう以下のフォルダ構成で格納する方法を紹介します。

```console
root/
├─ data
:   ├─ .gitkeep
    └── nuscenes/
        ├─ v1.0-mini/ <- 本体メタデータMini
        ├─ v1.0-trainval/ <- 本体メタデータTrainval
        ├─ samples/ <- 本体キーフレームのセンサデータ
        ├─ sweeps/ <- 本体キーフレーム以外のセンサデータ
        └─ maps/ <- 本体マップ画像＋Map expansion
```

- アカウント登録
- nuScenes本体のダウンロード（Mini, Trainval）
- Map expansionのダウンロード

`data/nuscenes`フォルダが存在しなければ、あらかじめ以下のように作成しておいてください。

```bash
cd data
mkdir nuscenes
```

### アカウント登録

Mini以外のデータセットのダウンロードはアカウント登録が必要です。まずは[nuScenesの登録ページ](https://www.nuscenes.org/sign-up)からユーザ登録してください。

[nuScenesのダウンロードページ](https://www.nuscenes.org/nuscenes#data-collection)の下の方に"Login"というボタンがあるので、登録したユーザーでログインすれば、登録が必要なデータセットもダウンロードできるようになります。

### nuScenes本体のダウンロード

前述のように、nuScenes本体のデータセットは以下の3種類のサブセットに分けられます。

|サブセット名|シーン数|キーフレーム数|サイズ（解凍するとおよそ1.4倍になります）|用途|
|---|---|---|---|---|
|Mini|10|404|4GB|動作確認|
|Trainval|850（train750+val150）|34,149（train28,130+val6019）|293GB|学習・検証用|
|Test|150|6,008|54GB|テスト用|

ここではMini、Trainvalをダウンロードする方法をそれぞれ解説します。
Trainvalはサイズが大きいので、まずはMiniをダウンロードして動作確認し、自動運転AIの学習等を本格的に行う際にTrainvalやTestをダウンロードすると良いでしょう。

#### Mini

Miniサブセットは以下コマンドでダウンロードできます。

```bash
cd [nuscenesフォルダ]
wget https://www.nuscenes.org/data/v1.0-mini.tgz
```

ダウンロードしたファイルを以下コマンドで解凍します。

```
tar -xf v1.0-mini.tgz
```

解凍が終わったら元の`v1.0-mini.tgz`ファイルは削除してしまった方が良いでしょう。
ダウンロード後のフォルダ構成は以下のようになっているはずです（`.v1.0-mini.txt`は使用しません）。

```console
root/
├─ data
:   └── nuscenes/
        ├─ v1.0-mini/
        ├─ samples/
        ├─ sweeps/
        ├─ maps/
        └─ .v1.0-mini.txt
```

#### Trainval

[ダウンロードページ](https://www.nuscenes.org/download)にログインすると、以下のようにTrainvalと記載されたタブにMetadataおよびpart1〜10のダウンロード項目があるので、"Asia"をクリックしてダウンロードします（ファイルサイズがかなり大きいので注意してください。USの方が地理的に近いのであればそちらを選択してください）。

<img src=images/download_trainval.png width=80%>

ダウンロードした`.tgz`ファイルを以下のように設置します（なおMiniデータセットと併用したい場合、混乱を防ぐためにまずMiniデータセットを`nuscines`とは別フォルダに移してから作業した方が良いでしょう）。

```console
root/
├── data/
:   └── nuscenes/
        :
        ├─ v1.0-trainval_meta.tgz
        ├─ v1.0-trainval01_blobs.tgz
        ├─ v1.0-trainval02_blobs.tgz
        ├─ v1.0-trainval03_blobs.tgz
        ├─ v1.0-trainval04_blobs.tgz
        ├─ v1.0-trainval05_blobs.tgz
        ├─ v1.0-trainval06_blobs.tgz
        ├─ v1.0-trainval07_blobs.tgz
        ├─ v1.0-trainval08_blobs.tgz
        ├─ v1.0-trainval09_blobs.tgz
        └─ v1.0-trainval10_blobs.tgz
```

`nuscenes`フォルダにcdしたのち、以下コマンドで`v1.0-trainval_meta.tgz`（メタデータ）を解凍します

```bash
tar -xf v1.0-trainval_meta.tgz
```

解凍が終わると以下のようなフォルダが出来上がります（解凍前の`v1.0-trainval_meta.tgz`ファイルは削除してしまった方が良いでしょう）。

```console
root/
├── data/
:   └── nuscenes/
        ├─ maps
        |   ├─ 36092f0b03a857c6a3403e25b4b7aab3.png
        |   ├─ 37819e65e09e5547b8a3ceaefba56bb2.png
        |   ├─ 53992ee3023e5494b90c316c183be829.png
        |   └─ 93406b464a165eaba6d9de76ca09f5da.png
        ├─ v1.0-trainval
        |   ├─ scene.json
        |   ├─ sample.json
        |   ├─ sample_data.json
        |   ├─ sample_annotation.json
        |   ├─ instance.json
        |   ├─ category.json
        |   ├─ attribute.json
        |   ├─ visibility.json
        |   ├─ sensor.json
        |   ├─ calibrated_sensor.json
        |   ├─ ego_pose.json
        |   ├─ log.json
        |   └─ map.json
        ├─ v1.0-trainval_meta.txt
        ├─ LICENSE
        |
        ├─ v1.0-trainval01_blobs.tgz
        ├─ v1.0-trainval02_blobs.tgz
        :
        略
```

残る10個の`v1.0-trainval**_blobs.tgz`ファイルを解凍していきます。`tar -xf`コマンドで解凍しても良いですが、時間が掛かるのでpvコマンド（[参考](https://devops-blog.virtualtech.jp/entry/20250114/1736833451)）を使用してプログレスバーを表示した状態でダウンロードすることを推奨します。

まず以下コマンドでpvをインストールします。

```bash
sudo apt install pv
```

例えば`v1.0-trainval01_blobs.tgz`を解凍する場合、以下コマンドを打ちます。

```bash
pv v1.0-trainval01_blobs.tgz | tar xzf -
```

解凍されたファイルは以下のように並びます

```console
root/
├── data/
:   └── nuscenes/
        ├─ maps
        ├─ v1.0-trainval
        ├─ v1.0-trainval_meta.txt
        ├─ LICENSE
        |
        ├─ samples
        :   ├─ CAM_BACK
            |   ├─ n008-2018-08-01-15-16-36-0400__CAM_BACK__1533151603537558.jpg
            :   :
            ├─ CAM_BACK_LEFT
            ├─ CAM_BACK_RIGHT
            ├─ CAM_FRONT
            ├─ CAM_FRONT_LEFT
            ├─ CAM_FRONT_RIGHT
            ├─ LIDAR_TOP
            |   ├─ n008-2018-08-01-15-16-36-0400__LIDAR_TOP__1533151603547590.pcd.bin
            :   :
            ├─ RADAR_BACK_LEFT
            |   ├─ n008-2018-08-01-15-16-36-0400__RADAR_BACK_LEFT__1533151603522238.pcd
            :   :
            ├─ RADAR_BACK_RIGHT
            ├─ RADAR_FRONT
            ├─ RADAR_FRONT_LEFT
        :   └─ RADAR_FRONT_RIGHT
        ├─ sweeps
        :   ├─ CAM_BACK
            ├─ CAM_BACK_LEFT
            ├─ CAM_BACK_RIGHT
            ├─ CAM_FRONT
            ├─ CAM_FRONT_LEFT
            ├─ CAM_FRONT_RIGHT
            ├─ LIDAR_TOP
            ├─ RADAR_BACK_LEFT
            ├─ RADAR_BACK_RIGHT
            ├─ RADAR_FRONT
            ├─ RADAR_FRONT_LEFT
        :   └─ RADAR_FRONT_RIGHT
        ├─ v1.0-trainval01_blobs.tgz
        ├─ v1.0-trainval02_blobs.tgz
        :
        略
```

あとは以下のように10個のファイルを解凍していきます（**解凍が終わったtgzファイルは容量節約のため随時削除を推奨します**）。

```bash
pv v1.0-trainval02_blobs.tgz | tar xzf -
```

```bash
pv v1.0-trainval03_blobs.tgz | tar xzf -
```

:

```bash
pv v1.0-trainval10_blobs.tgz | tar xzf -
```

最終的に解凍したファイル群が以下のように同じ`samples`、`sweeps`フォルダの中に格納されれば成功です

```console
root/
├── data/
:   └── nuscenes/
        ├─ maps
        ├─ v1.0-trainval
        ├─ samples
        :   ├─ CAM_BACK
            |   ├─ n008-2018-08-01-15-16-36-0400__CAM_BACK__1533151603537558.jpg
            :   :
            ├─ CAM_BACK_LEFT
            ├─ CAM_BACK_RIGHT
            ├─ CAM_FRONT
            ├─ CAM_FRONT_LEFT
            ├─ CAM_FRONT_RIGHT
            ├─ LIDAR_TOP
            |   ├─ n008-2018-08-01-15-16-36-0400__LIDAR_TOP__1533151603547590.pcd.bin
            :   :
            ├─ RADAR_BACK_LEFT
            |   ├─ n008-2018-08-01-15-16-36-0400__RADAR_BACK_LEFT__1533151603522238.pcd
            :   :
            ├─ RADAR_BACK_RIGHT
            ├─ RADAR_FRONT
            ├─ RADAR_FRONT_LEFT
        :   └─ RADAR_FRONT_RIGHT
        ├─ sweeps
        :   ├─ CAM_BACK
            ├─ CAM_BACK_LEFT
            ├─ CAM_BACK_RIGHT
            ├─ CAM_FRONT
            ├─ CAM_FRONT_LEFT
            ├─ CAM_FRONT_RIGHT
            ├─ LIDAR_TOP
            ├─ RADAR_BACK_LEFT
            ├─ RADAR_BACK_RIGHT
            ├─ RADAR_FRONT
            ├─ RADAR_FRONT_LEFT
        :   └─ RADAR_FRONT_RIGHT
        略
        :
```

### Map expansionのダウンロード

[ダウンロードページ](https://www.nuscenes.org/download)の`Map expansion`から、`Map expansion pack (v1.3)`をダウンロードします。

ダウンロードした`nuScenes-map-expansion-v1.3.zip`を、以下のように`maps`フォルダ内に設置します。

```console
root/
├── data/
:   └── nuscenes/
        ├─ v1.0-*/
        ├─ samples/
        ├─ sweeps/
        ├─ maps/
        :   └─ nuScenes-map-expansion-v1.3.zip
```

以下コマンドで解凍します。

```bash
cd data/nuscenes/maps
unzip nuScenes-map-expansion-v1.3.zip
```

解凍が終わると、`basemap`（Map作成時に取得したLiDAR点群からなる高精細画像）、`expansion`（アノテーション本体）、`prediction`（将来軌跡予測向けデータ）フォルダが新たに生成され、各種ファイルが格納されます

```console
root/
├── data/
:   └── nuscenes/
        ├─ v1.0-*/ (nuScenes本体)
        ├─ samples/ (nuScenes本体)
        ├─ sweeps/ (nuScenes本体)
        └─ map/
            ├─ 36092f0b03a857c6a3403e25b4b7aab3.png (nuScenes本体)
            ├─ 37819e65e09e5547b8a3ceaefba56bb2.png (nuScenes本体)
            ├─ 53992ee3023e5494b90c316c183be829.png (nuScenes本体)
            ├─ 93406b464a165eaba6d9de76ca09f5da.png (nuScenes本体)
            ├─ basemap <- Map expansionで追加
            :   ├─ boston-seaport.png
                ├─ singapore-hollandvillage.png
                ├─ singapore-onenorth.png
            :   └─ singapore-queenstown.png
            ├─ expansion <- Map expansionで追加
            :   ├─ boston-seaport.json
                ├─ singapore-hollandvillage.json
                ├─ singapore-onenorth.json
            :   └─ singapore-queenstown.json
            └─ prediction <- Map expansionで追加
                └─ prediction_scenes.json
```
