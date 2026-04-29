## Download nuScenes dataset

In this page, download nuScenes and Map expansion dataset as follows:

```console
root/
├─ data
:   ├─ .gitkeep
    └── nuscenes/
        ├─ v1.0-mini/ <- Mini metadata
        ├─ v1.0-trainval/ <- Trainval metadata
        ├─ samples/ <- keyframe sensor data (LiDAR + CAM)
        ├─ sweeps/ <- non-keyframe sensor data (LiDAR + CAM)
        └─ maps/ <- basemap images + Map expansion
```

Procedure

- Sign up to nuScenes
- Download nuScenes dataset
- Download Map expansion

If `data/nuscenes` folder doesn't exist, please create it as follows:

```bash
cd data
mkdir nuscenes
```

### Sign up to nuScenes

Downloading nuScenes dataset needs regsitration (Except Mini dataset). Please [sign up to this page](https://www.nuscenes.org/sign-up).

After signing up, you can access the datasets by "Login" button on [the download page](https://www.nuscenes.org/nuscenes#data-collection).

### Download nuScenes dataset

nuScenes has the following three subsets.

|Subset name|# of scenes|# of keyframes|Size|Usate|
|---|---|---|---|---|
|Mini|10|404|4GB|Operation check|
|Trainval|850 (train750+val150)|34,149 (train28,130+val6019)|293GB|Training & Validation|
|Test|150|6,008|54GB|Test|

Trainval is a huge subset, so first, downloading Mini dataset and cheking the operation of the nusence-viewer is reccomended.

#### Mini

You can download Mini subset by wget without login.

```bash
cd data/nuscenes
wget https://www.nuscenes.org/data/v1.0-mini.tgz
```

Extract the downloaded file

```
tar -xf v1.0-mini.tgz
```

The extracted folder is as follows (`.v1.0-mini.txt` is not used):

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

Log in [the download page](https://www.nuscenes.org/download) and download all ten divided archives below by clicking "US" or "Asia" button based on your location.

<img src=images/download_trainval.png width=80%>

Place the downloaded `.tgz` files as follows.

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

Extract the metadata

```bash
cd data/nuscenes
tar -xf v1.0-trainval_meta.tgz
```

The extracted metadata is as follows:

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
```

Then extract the remaining `v1.0-trainval**_blobs.tgz` files. You can use `tar -xf` command, but these files are huge and a progress bar is helpful for such time-consuming extraction, so `pv` command is reccomended.

You can install `pv` as follows:

```bash
sudo apt install pv
```

Then extract all the `v1.0-trainval**_blobs.tgz` files. For example, `v1.0-trainval01_blobs.tgz` can be extracted as follows.

```bash
pv v1.0-trainval01_blobs.tgz | tar xzf -
```

The extracted folders are as follows:

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

Then extract the remaining files as follows.

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

Every time the extraction is completed, deleting the original `v1.0-trainval**_blobs.tgz` file is reccomended to avoid storage overflow.

The extracted sensor files are stored on the same folders as follows:

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

### Download Map expansion

Download `Map expansion pack (v1.3)` from [the download page](https://www.nuscenes.org/download).

Place the downloaded `nuScenes-map-expansion-v1.3.zip` file as follows:

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

Unzip the file as follows:

```bash
cd data/nuscenes/maps
unzip nuScenes-map-expansion-v1.3.zip
```

The extracted Map expansion files are as follows:

```console
root/
├── data/
:   └── nuscenes/
        ├─ v1.0-*/ (nuScenes)
        ├─ samples/ (nuScenes)
        ├─ sweeps/ (nuScenes)
        └─ map/
            ├─ 36092f0b03a857c6a3403e25b4b7aab3.png (nuScenes)
            ├─ 37819e65e09e5547b8a3ceaefba56bb2.png (nuScenes)
            ├─ 53992ee3023e5494b90c316c183be829.png (nuScenes)
            ├─ 93406b464a165eaba6d9de76ca09f5da.png (nuScenes)
            ├─ basemap <- **Map expansion**
            :   ├─ boston-seaport.png
                ├─ singapore-hollandvillage.png
                ├─ singapore-onenorth.png
            :   └─ singapore-queenstown.png
            ├─ expansion <- **Map expansion**
            :   ├─ boston-seaport.json
                ├─ singapore-hollandvillage.json
                ├─ singapore-onenorth.json
            :   └─ singapore-queenstown.json
            └─ prediction <- **Map expansion**
                └─ prediction_scenes.json
```
