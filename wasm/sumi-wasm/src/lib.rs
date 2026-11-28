use js_sys::{Object, Reflect, Uint8Array};
use sumi_core::{convert_bytes, ConvertOptions, GrayModel, Mode};
use wasm_bindgen::prelude::*;

fn set(obj: &Object, key: &str, value: &JsValue) -> Result<(), JsValue> {
    Reflect::set(obj, &JsValue::from_str(key), value)?;
    Ok(())
}

#[wasm_bindgen]
pub fn sumi_convert(
    bytes: &[u8],
    mode: &str,
    gray_model: &str,
    threshold: f32,
) -> Result<JsValue, JsValue> {
    let mut options = ConvertOptions::default();
    options.mode = match mode {
        "monochrome" | "mono" => Mode::Monochrome,
        _ => Mode::Grayscale,
    };
    options.gray_model = match gray_model {
        "colorimetric" => GrayModel::Colorimetric,
        _ => GrayModel::Luma,
    };
    if (0.0..=1.0).contains(&threshold) {
        options.threshold = threshold;
    }

    let converted =
        convert_bytes(bytes, &options).map_err(|err| JsValue::from_str(&err.to_string()))?;

    let result = Object::new();
    set(&result, "pdf", &Uint8Array::from(converted.pdf.as_slice()).into())?;

    let report = Object::new();
    set(&report, "pages", &JsValue::from_f64(converted.report.pages as f64))?;
    set(
        &report,
        "contentStreams",
        &JsValue::from_f64(converted.report.content_streams as f64),
    )?;
    set(
        &report,
        "colorOperators",
        &JsValue::from_f64(converted.report.color_operators as f64),
    )?;
    set(
        &report,
        "images",
        &JsValue::from_f64(converted.report.images as f64),
    )?;
    set(
        &report,
        "shadings",
        &JsValue::from_f64(converted.report.shadings as f64),
    )?;
    set(
        &report,
        "warnings",
        &JsValue::from_f64(converted.report.warnings.len() as f64),
    )?;
    set(
        &report,
        "complete",
        &JsValue::from_bool(converted.report.warnings.is_empty()),
    )?;
    set(&result, "report", &report.into())?;

    Ok(result.into())
}
