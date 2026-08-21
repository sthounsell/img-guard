//! Measures how much of `phash`'s cost is image decode vs. the actual
//! DCT/hash computation (issue #10) — answers "is a scaled/progressive
//! decode worth pursuing?" with a number instead of a guess.
//!
//! `image` and `image_hasher` are img_guard_core's own direct dependencies,
//! so this mirrors `phash`'s internal steps by calling them directly rather
//! than needing img_guard_core to expose extra pub API just for benchmarking.

use criterion::{BenchmarkId, Criterion, criterion_group, criterion_main};
use image::{ImageFormat, RgbImage};
use image_hasher::{HashAlg, HasherConfig};
use std::io::Cursor;

/// A diagonal gradient at `size`x`size`, encoded as PNG — a synthetic
/// fixture so the benchmark doesn't depend on external image files (same
/// approach as the Rust core's own unit tests).
fn png_bytes(size: u32) -> Vec<u8> {
    let image = RgbImage::from_fn(size, size, |x, y| {
        let v = (((x + y) as u64 * 255) / (size as u64 * 2)) as u8;
        image::Rgb([v, v, v])
    });
    let mut bytes = Vec::new();
    image
        .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
        .expect("encoding a synthetic fixture image should never fail");
    bytes
}

fn bench_phash_pipeline(c: &mut Criterion) {
    // Small (typical avatar/thumbnail) through large (an un-resized phone
    // photo) — decode cost scales with pixel count, hash cost is close to
    // fixed (the hasher downscales before its DCT step regardless of input
    // size), so the split should widen as size grows.
    let sizes = [64u32, 512, 2048, 4096];

    let mut full_pipeline = c.benchmark_group("phash (full pipeline)");
    for size in sizes {
        let bytes = png_bytes(size);
        full_pipeline.bench_with_input(
            BenchmarkId::from_parameter(format!("{size}x{size}")),
            &bytes,
            |b, bytes| b.iter(|| img_guard_core::phash(bytes).unwrap()),
        );
    }
    full_pipeline.finish();

    let mut decode_only = c.benchmark_group("decode only");
    for size in sizes {
        let bytes = png_bytes(size);
        decode_only.bench_with_input(
            BenchmarkId::from_parameter(format!("{size}x{size}")),
            &bytes,
            |b, bytes| b.iter(|| image::load_from_memory(bytes).unwrap()),
        );
    }
    decode_only.finish();

    let mut hash_only = c.benchmark_group("hash compute only (pre-decoded)");
    for size in sizes {
        let image = image::load_from_memory(&png_bytes(size)).unwrap();
        let hasher = HasherConfig::new()
            .hash_alg(HashAlg::Median)
            .preproc_dct()
            .to_hasher();
        hash_only.bench_with_input(
            BenchmarkId::from_parameter(format!("{size}x{size}")),
            &image,
            |b, image| b.iter(|| hasher.hash_image(image)),
        );
    }
    hash_only.finish();
}

criterion_group!(benches, bench_phash_pipeline);
criterion_main!(benches);
