//! Pure, side-effect-free compute kernel for img-guard (ADR 0001).
//!
//! Exposes three stateless functions — `md5_hex`, `phash`, `hamming_distance` —
//! with no filesystem access or persistence. Node owns the Store and all
//! orchestration; this crate only computes.

use image_hasher::{HashAlg, HasherConfig};

/// Returns the hex-encoded MD5 digest of `bytes`.
pub fn md5_hex(bytes: &[u8]) -> String {
    format!("{:x}", md5::compute(bytes))
}

/// Decodes `bytes` as an image and returns its 64-bit perceptual hash
/// (`image_hasher`'s Median algorithm with DCT preprocessing — the
/// combination the crate documents as its pHash implementation).
pub fn phash(bytes: &[u8]) -> Result<u64, String> {
    let image = image::load_from_memory(bytes).map_err(|err| err.to_string())?;

    let hasher = HasherConfig::new()
        .hash_alg(HashAlg::Median)
        .preproc_dct()
        .to_hasher();

    let hash_bytes = hasher.hash_image(&image).as_bytes().to_vec();
    let array: [u8; 8] = hash_bytes
        .try_into()
        .map_err(|_| "expected a 64-bit (8-byte) hash".to_string())?;

    Ok(u64::from_be_bytes(array))
}

/// Counts the differing bits between two 64-bit hashes.
pub fn hamming_distance(a: u64, b: u64) -> u32 {
    (a ^ b).count_ones()
}

/// Thin WASM boundary (ADR 0002) — `wasm-bindgen` exports of the three pure
/// functions above, unchanged in behaviour, for `wasm-pack --target nodejs`
/// to compile to a `require()`-able Node package. No logic lives here.
mod wasm {
    use wasm_bindgen::prelude::*;

    #[wasm_bindgen(js_name = md5)]
    pub fn md5_js(bytes: &[u8]) -> String {
        super::md5_hex(bytes)
    }

    #[wasm_bindgen(js_name = phash)]
    pub fn phash_js(bytes: &[u8]) -> Result<u64, JsValue> {
        super::phash(bytes).map_err(|err| JsValue::from_str(&err))
    }

    #[wasm_bindgen(js_name = hammingDistance)]
    pub fn hamming_distance_js(a: u64, b: u64) -> u32 {
        super::hamming_distance(a, b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageFormat, RgbImage};
    use std::io::Cursor;

    // -- md5_hex -------------------------------------------------------

    #[test]
    fn md5_hex_of_empty_input_matches_known_digest() {
        assert_eq!(md5_hex(b""), "d41d8cd98f00b204e9800998ecf8427e");
    }

    #[test]
    fn md5_hex_of_known_input_matches_known_digest() {
        assert_eq!(md5_hex(b"hello world"), "5eb63bbbe01eeed093cb22bb8f5acdc3");
    }

    // -- hamming_distance ------------------------------------------------

    #[test]
    fn hamming_distance_of_identical_hashes_is_zero() {
        assert_eq!(hamming_distance(0b1010_1010, 0b1010_1010), 0);
    }

    #[test]
    fn hamming_distance_counts_differing_bits() {
        assert_eq!(hamming_distance(0b1010, 0b1000), 1);
        assert_eq!(hamming_distance(0b1111, 0b0000), 4);
    }

    #[test]
    fn hamming_distance_of_fully_inverted_hashes_is_64() {
        assert_eq!(
            hamming_distance(0x0000_0000_0000_0000, 0xFFFF_FFFF_FFFF_FFFF),
            64
        );
    }

    // -- phash -----------------------------------------------------------

    /// Encodes a synthetic 64x64 image as PNG bytes, driven by a per-pixel
    /// colour function, so tests don't depend on external fixture files.
    fn png_bytes(pixel: impl Fn(u32, u32) -> [u8; 3]) -> Vec<u8> {
        let image = RgbImage::from_fn(64, 64, |x, y| image::Rgb(pixel(x, y)));
        let mut bytes = Vec::new();
        image
            .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
            .expect("encoding a synthetic fixture image should never fail");
        bytes
    }

    fn diagonal_gradient() -> Vec<u8> {
        png_bytes(|x, y| {
            let v = (((x + y) * 255) / 128) as u8;
            [v, v, v]
        })
    }

    /// Pseudo-random per-pixel noise (deterministic, no external RNG needed) —
    /// about as visually unlike `diagonal_gradient` as two images get.
    fn noise() -> Vec<u8> {
        png_bytes(|x, y| {
            let n = (x
                .wrapping_mul(2_654_435_761)
                .wrapping_add(y.wrapping_mul(40_503))
                % 256) as u8;
            [n, n, n]
        })
    }

    #[test]
    fn phash_succeeds_for_a_valid_image() {
        assert!(phash(&diagonal_gradient()).is_ok());
    }

    #[test]
    fn phash_is_deterministic_for_the_same_image_bytes() {
        let bytes = diagonal_gradient();
        assert_eq!(phash(&bytes).unwrap(), phash(&bytes).unwrap());
    }

    #[test]
    fn phash_of_visually_different_images_has_a_large_hamming_distance() {
        let a = phash(&diagonal_gradient()).unwrap();
        let b = phash(&noise()).unwrap();
        assert!(
            hamming_distance(a, b) > 10,
            "expected visually distinct images to hash far apart"
        );
    }

    #[test]
    fn phash_of_invalid_bytes_is_an_error() {
        assert!(phash(b"not an image").is_err());
    }
}
