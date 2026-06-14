import json

ALL = True

# Vehicle
logs = json.loads(open(f".{'/all' if ALL else ''}/log.json").read())
print(f'n_logs: {len(logs)}')
maps = json.loads(open(f".{'/all' if ALL else ''}/map.json").read())
print(f'n_maps: {len(maps)}')
calibrated_sensors = json.loads(open(f".{'/all' if ALL else ''}/calibrated_sensor.json").read())
print(f'n_calibrated_sensors: {len(calibrated_sensors)}')
sensors = json.loads(open(f".{'/all' if ALL else ''}/sensor.json").read())
print(f'n_sensors: {len(sensors)}')

# Extractions
scenes = json.loads(open(f".{'/all' if ALL else ''}/scene.json").read())
print(f'n_scenes: {len(scenes)}')
samples = json.loads(open(f".{'/all' if ALL else ''}/sample.json").read())
print(f'n_samples: {len(samples)}')
sample_data = json.loads(open(f".{'/all' if ALL else ''}/sample_data.json").read())
print(f'n_sample_data: {len(sample_data)}')
key_sample_data = [rec for rec in sample_data if rec['is_key_frame']]
print(f'n_key_sample_data: {len(key_sample_data)}')
ego_poses = json.loads(open(f".{'/all' if ALL else ''}/ego_pose.json").read())
print(f'n_ego_poses: {len(ego_poses)}')

# Annotations
instances = json.loads(open(f".{'/all' if ALL else ''}/instance.json").read())
print(f'n_instances: {len(instances)}')
sample_annotations = json.loads(open(f".{'/all' if ALL else ''}/sample_annotation.json").read())
print(f'n_sample_annotations: {len(sample_annotations)}')

# Taxonomies
categories = json.loads(open(f".{'/all' if ALL else ''}/category.json").read())
print(f'n_categories: {len(categories)}')
attributes = json.loads(open(f".{'/all' if ALL else ''}/attribute.json").read())
print(f'n_attributes: {len(attributes)}')
