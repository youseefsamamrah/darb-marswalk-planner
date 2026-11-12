"""
hirise_dem.py  -  read the USGS "MSL Gale DEM Mosaic 1m v3" GeoTIFF with ONLY the Python standard library.

The DEM (made from HiRISE stereo images, 1 metre per pixel) is one big file (3.9 GB):
  https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif
Layout (read from the file's own TIFF tags):
  32980 columns x 57440 rows, 32-bit float elevation (metres), LZW compression,
  one image row per "strip", Mars equirectangular projection (centre longitude 0,
  sphere radius 3,396,190 m), NoData = -32767.

We only need a few thousand rows around our study box, so this reader can work on the
downloaded file (fast) OR fetch only the needed rows from the server with HTTP range requests.
"""
import os
import struct
import urllib.request

DEM_URL = "https://planetarymaps.usgs.gov/mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif"
LOCAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "raw", "hirise_dem",
                     "MSL_Gale_DEM_Mosaic_1m_v3.tif")
NODATA = -32767.0
R_MARS = 3396190.0


def lzw_decode(data):
    """TIFF-style LZW decompression (codes are 9-12 bits, most significant bit first)."""
    CLEAR, EOI = 256, 257
    out = bytearray()
    table = [bytes([i]) for i in range(256)] + [b"", b""]
    width, bitpos, nbits = 9, 0, len(data) * 8
    prev = None
    while bitpos + width <= nbits:
        # read `width` bits starting at bitpos
        byte = bitpos >> 3
        chunk = int.from_bytes(data[byte:byte + 3].ljust(3, b"\0"), "big")
        code = (chunk >> (24 - (bitpos & 7) - width)) & ((1 << width) - 1)
        bitpos += width
        if code == EOI:
            break
        if code == CLEAR:
            table = table[:258]
            width, prev = 9, None
            continue
        if code < len(table):
            entry = table[code]
            if prev is not None:
                table.append(prev + entry[:1])
        else:                                   # the special "code not yet in table" case
            entry = prev + prev[:1]
            table.append(entry)
        out += entry
        prev = entry
        # TIFF "early change": grow the code width one code early
        if len(table) + 1 >= (1 << width) and width < 12:
            width += 1
    return bytes(out)


class HiriseDEM:
    def __init__(self):
        self.local = os.path.exists(LOCAL) and os.path.getsize(LOCAL) > 3_000_000_000
        self.f = open(LOCAL, "rb") if self.local else None
        self._read_tags()

    def _read(self, start, length):
        if self.local:
            self.f.seek(start)
            return self.f.read(length)
        req = urllib.request.Request(DEM_URL, headers={"Range": "bytes=%d-%d" % (start, start + length - 1),
                                                       "User-Agent": "darb-marswalk-student-project"})
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.read()

    def _read_tags(self):
        head = self._read(0, 8)
        assert head[:4] == b"II*\x00", "expected a little-endian classic TIFF"
        ifd = struct.unpack("<I", head[4:8])[0]
        n = struct.unpack("<H", self._read(ifd, 2))[0]
        raw = self._read(ifd + 2, n * 12)
        tags = {}
        for i in range(n):
            tag, typ, cnt, val = struct.unpack("<HHI4s", raw[i * 12:(i + 1) * 12])
            tags[tag] = (typ, cnt, val)

        def one(tag):
            typ, _, val = tags[tag]
            return struct.unpack("<H" if typ == 3 else "<I", val[:2] if typ == 3 else val)[0]

        def doubles(tag):
            typ, cnt, val = tags[tag]
            return struct.unpack("<%dd" % cnt, self._read(struct.unpack("<I", val)[0], 8 * cnt))

        self.width, self.height = one(256), one(257)
        assert one(258) == 32 and one(339) == 3, "expected 32-bit float samples"
        assert one(259) == 5, "expected LZW compression"
        assert one(278) == 1, "expected one row per strip"
        self.predictor = one(317) if 317 in tags else 1
        assert self.predictor == 1, "predictor not supported"
        scale, tie = doubles(33550), doubles(33922)
        self.px_x, self.px_y = scale[0], scale[1]
        self.x0, self.y0 = tie[3], tie[4]          # map coordinates (metres) of the top-left corner
        n_strips = tags[273][1]
        self.offsets = struct.unpack("<%dI" % n_strips, self._read(struct.unpack("<I", tags[273][2])[0], 4 * n_strips))
        self.counts = struct.unpack("<%dI" % n_strips, self._read(struct.unpack("<I", tags[279][2])[0], 4 * n_strips))

    # --- coordinates: equirectangular, centre longitude 0, standard parallel 0 ---
    def lonlat_to_colrow(self, lon, lat):
        import math
        x = R_MARS * math.radians(lon)
        y = R_MARS * math.radians(lat)
        return (x - self.x0) / self.px_x, (self.y0 - y) / self.px_y

    def row(self, r):
        """Return one full row of elevations as a tuple of floats (NoData = -32767)."""
        data = lzw_decode(self._read(self.offsets[r], self.counts[r]))
        return struct.unpack("<%df" % self.width, data[:4 * self.width])
