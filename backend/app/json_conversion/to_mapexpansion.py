from uuid import uuid4, UUID
import numpy as np
import xxhash
from backend.app.json_conversion import schemas_mapexpansion

class GeomCollection:
    """
    Collection of geometry (polygon, line, node) with fast lookup of duplicating polygons.
    """
    def __init__(self):
        self.hash_to_token = {}  # hash to token mapping
        self.num_duplicates = 0  # number of duplicates found

    def check_exists(self, geom: np.ndarray) -> uuid4:
        """Check if the geometry already exists, return existing token or new token."""
        # Create hash of the geometry (only consider geom_to_hash for hashing)
        hash_input = np.ascontiguousarray(geom).tobytes()
        hash_value = xxhash.xxh3_128_digest(hash_input)
        # Check if hash exists
        if hash_value in self.hash_to_token: # found
            self.num_duplicates += 1
            return True, self.hash_to_token[hash_value]
        else: # not found
            new_token = uuid4()
            self.hash_to_token[hash_value] = new_token
            return False, new_token
        
class NodeCollection(GeomCollection):
    """Collection of nodes for NuScenes map format with fast lookup of duplicating polygons."""
    def __init__(self, image_height: int, resolution: float, round_decimals: int):
        super().__init__()
        self.image_height = image_height  # height of the image in pixels
        self.resolution = resolution  # resolution of the image coordinates (m/pixel)
        self.round_decimals = round_decimals  # number of decimals to round coordinates
        self.nodes = []  # list of schemas_nuscmap.Node entries

    def add(self, point: np.ndarray) -> uuid4:
        """
        Add a node if not already present or return existing token.
        
        Args:
            point: np.ndarray of shape (2,) representing (y, x) coordinates.
        """
        rounded_point = np.round(point, decimals=self.round_decimals).astype(np.int32)
        # Check if node exists (only consider exterior for hashing)
        exists, token = self.check_exists(rounded_point)
        # Create new node entry if not exists
        if not exists:
            # Convert the exterior and holes coordinates from pixels (topleft is (0,0)) to meters (bottomleft is (0,0))
            meter_x = float(rounded_point[1]) * self.resolution
            meter_y = (self.image_height - float(rounded_point[0])) * self.resolution
            # Add node entry
            self.nodes.append(schemas_mapexpansion.Node(
                token=token,
                x=meter_x,
                y=meter_y
            ))
        # Return token
        return token

class LineCollection(GeomCollection):
    """Collection of lines for NuScenes map format with fast lookup of duplicating polygons."""
    def __init__(self):
        super().__init__()
        self.lines = []  # list of schemas_nuscmap.Line entries

    def add(self, line: np.ndarray,
            node_collection: NodeCollection) -> uuid4:
        """
        Add a line if not already present or return existing token.

        Args:
            line: np.ndarray of shape (N, 2) representing (y, x) coordinates of line points.
            node_collection: NodeCollection to manage nodes.
        """
        # Check if line exists (only consider exterior for hashing)
        exists, token = self.check_exists(line)
        # Create new line entry if not exists
        if not exists:
            node_tokens = [] # list of node tokens
            for point in line:
                node_token = node_collection.add(point)
                node_tokens.append(node_token)
            self.lines.append(schemas_mapexpansion.Line(
                token=token,
                node_tokens=node_tokens
            ))
        # Return token
        return token

class PolygonCollection(GeomCollection):
    """Collection of polygons for NuScenes map format with fast lookup of duplicating polygons."""
    def __init__(self):
        super().__init__()
        self.polygons = []  # list of schemas_nuscmap.Polygon entries

    def add(self, exterior: np.ndarray, holes: list[np.ndarray],
            node_collection: NodeCollection) -> uuid4:
        """
        Add a polygon if not already present or return existing token.

        Args:
            exterior: np.ndarray of shape (N, 2) representing (y, x) coordinates of exterior polygon points.
            holes: list of np.ndarray, each of shape (M, 2) representing (y, x) coordinates of hole polygon points.
            node_collection: NodeCollection to manage nodes.
        """
        # Check if polygon exists (only consider exterior for hashing)
        exists, token = self.check_exists(exterior)
        # Create new polygon entry if not exists
        if not exists:
            # Add exterior node entries
            exterior_node_tokens = [] # list of node tokens for exterior
            for point in exterior:
                node_token = node_collection.add(point)
                exterior_node_tokens.append(node_token)
            hole_objects = [] # list of node tokens for holes
            # Add hole node entries
            for hole in holes:
                hole_node_tokens = []
                for point in hole:
                    node_token = node_collection.add(point)
                    hole_node_tokens.append(node_token)
                hole_objects.append(schemas_mapexpansion.Hole(
                    node_tokens=hole_node_tokens
                ))
            # Add polygon entry
            self.polygons.append(schemas_mapexpansion.Polygon(
                token=token,
                exterior_node_tokens=exterior_node_tokens,
                holes=hole_objects
            ))
        # Return token
        return token
    
# Convert UUIDs to strings for JSON serialization
def _convert_uuids(obj):
    if isinstance(obj, dict):
        return {k: _convert_uuids(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_convert_uuids(item) for item in obj]
    elif isinstance(obj, UUID):
        return str(obj)
    else:
        return obj
