#include <errno.h>

#include <pb_decode.h>
#include <pb_encode.h>
#include <zephyr/device.h>
#include <zephyr/devicetree.h>
#include <zephyr/drivers/haptics.h>
#include <zephyr/drivers/haptics/drv2605.h>
#include <zephyr/drivers/i2c.h>
#include <zephyr/sys/util.h>
#include <zmk/studio/custom.h>
#include <cormoran/drv2605l-lab/drv2605l_lab.pb.h>

#include <zephyr/logging/log.h>
LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

#define DRV2605L_STATUS_REG 0x00
#define DRV2605L_GO_REG 0x0c
#define DRV2605L_GO_BIT BIT(0)
#define DRV2605L_CONTROL3_REG 0x1d
#define DRV2605L_LRA_OPEN_LOOP_BIT BIT(0)

BUILD_ASSERT(CONFIG_ZMK_STUDIO_RPC_TX_BUF_SIZE >= 64,
             "DRV2605L lab requires a 64-byte Studio TX buffer");

#if IS_ENABLED(CONFIG_HAPTICS_DRV2605) && DT_NODE_EXISTS(DT_ALIAS(drv2605l)) &&                    \
    DT_NODE_HAS_STATUS(DT_ALIAS(drv2605l), okay)
#define DRV2605L_LAB_HAS_DEVICE 1
#define DRV2605L_LAB_NODE DT_ALIAS(drv2605l)
static const struct i2c_dt_spec drv2605l_i2c = I2C_DT_SPEC_GET(DRV2605L_LAB_NODE);
static const struct device *const drv2605l_device = DEVICE_DT_GET(DRV2605L_LAB_NODE);
#else
#define DRV2605L_LAB_HAS_DEVICE 0
#endif

static struct zmk_rpc_custom_subsystem_meta drv2605l_lab_subsystem_meta = {
    ZMK_RPC_CUSTOM_SUBSYSTEM_UI_URLS("https://cormoran.github.io/zmk-module-drv2605l-lab/"),
    .security = ZMK_STUDIO_RPC_HANDLER_UNSECURED,
};

ZMK_RPC_CUSTOM_SUBSYSTEM(cormoran__drv2605l_lab, &drv2605l_lab_subsystem_meta,
                         drv2605l_lab_rpc_handle_request);
ZMK_RPC_CUSTOM_SUBSYSTEM_RESPONSE_BUFFER(cormoran__drv2605l_lab, cormoran_drv2605l_lab_Response);

static bool drv2605l_lab_ready(void) {
#if DRV2605L_LAB_HAS_DEVICE
    return device_is_ready(drv2605l_device) && i2c_is_ready_dt(&drv2605l_i2c);
#else
    return false;
#endif
}

static int drv2605l_lab_status(uint8_t *status, bool *playing) {
#if DRV2605L_LAB_HAS_DEVICE
    if (!drv2605l_lab_ready()) {
        return -ENODEV;
    }
    int err = i2c_reg_read_byte_dt(&drv2605l_i2c, DRV2605L_STATUS_REG, status);
    if (err != 0) {
        return err;
    }
    uint8_t go = 0;
    err = i2c_reg_read_byte_dt(&drv2605l_i2c, DRV2605L_GO_REG, &go);
    if (err == 0) {
        *playing = (go & DRV2605L_GO_BIT) != 0;
    }
    return err;
#else
    ARG_UNUSED(status);
    ARG_UNUSED(playing);
    return -ENODEV;
#endif
}

static int drv2605l_lab_stop(void) {
#if DRV2605L_LAB_HAS_DEVICE
    if (!drv2605l_lab_ready()) {
        return -ENODEV;
    }
    return haptics_stop_output(drv2605l_device);
#else
    return -ENODEV;
#endif
}

static int drv2605l_lab_play(uint32_t library, uint32_t effect) {
    if (library < 1 || library > 6 || effect < 1 || effect > 123) {
        return -EINVAL;
    }
#if DRV2605L_LAB_HAS_DEVICE
    if (!drv2605l_lab_ready()) {
        return -ENODEV;
    }
    if ((DT_ENUM_IDX(DRV2605L_LAB_NODE, actuator_mode) == 1) != (library == 6)) {
        return -EINVAL;
    }

    int err = haptics_stop_output(drv2605l_device);
    if (err != 0) {
        return err;
    }

    struct drv2605_rom_data rom = {
        .trigger = DRV2605_MODE_INTERNAL_TRIGGER,
        .library = (enum drv2605_library)library,
        .seq_regs = {(uint8_t)effect, 0},
    };
    const union drv2605_config_data data = {.rom_data = &rom};
    err = drv2605_haptic_config(drv2605l_device, DRV2605_HAPTICS_SOURCE_ROM, &data);
    if (err != 0) {
        return err;
    }
    /* Zephyr initializes LRA_OPEN_LOOP. Restore auto-resonance for ROM library 6. */
    if (library == 6) {
        err = i2c_reg_update_byte_dt(&drv2605l_i2c, DRV2605L_CONTROL3_REG,
                                     DRV2605L_LRA_OPEN_LOOP_BIT, 0);
        if (err != 0) {
            return err;
        }
    }
    return haptics_start_output(drv2605l_device);
#else
    return -ENODEV;
#endif
}

static bool drv2605l_lab_rpc_handle_request(const zmk_custom_CallRequest *raw_request,
                                            pb_callback_t *encode_response) {
    cormoran_drv2605l_lab_Response *resp =
        ZMK_RPC_CUSTOM_SUBSYSTEM_RESPONSE_BUFFER_ALLOCATE(cormoran__drv2605l_lab, encode_response);
    cormoran_drv2605l_lab_Request req = cormoran_drv2605l_lab_Request_init_zero;
    pb_istream_t stream =
        pb_istream_from_buffer(raw_request->payload.bytes, raw_request->payload.size);

    if (!pb_decode(&stream, cormoran_drv2605l_lab_Request_fields, &req)) {
        LOG_WRN("Invalid DRV2605L lab request: %s", PB_GET_ERROR(&stream));
        resp->which_response_type = cormoran_drv2605l_lab_Response_result_tag;
        resp->response_type.result.error_code = -EINVAL;
        return true;
    }

    switch (req.which_request_type) {
    case cormoran_drv2605l_lab_Request_get_status_tag: {
        uint8_t status = 0;
        bool playing = false;
        int err = drv2605l_lab_status(&status, &playing);
        resp->which_response_type = cormoran_drv2605l_lab_Response_status_tag;
        resp->response_type.status.present = DRV2605L_LAB_HAS_DEVICE;
        resp->response_type.status.ready = drv2605l_lab_ready();
        resp->response_type.status.status = status;
        resp->response_type.status.error_code = err;
        resp->response_type.status.playing = playing;
        break;
    }
    case cormoran_drv2605l_lab_Request_play_tag:
        resp->which_response_type = cormoran_drv2605l_lab_Response_result_tag;
        resp->response_type.result.error_code =
            drv2605l_lab_play(req.request_type.play.library, req.request_type.play.effect);
        break;
    case cormoran_drv2605l_lab_Request_stop_tag:
        resp->which_response_type = cormoran_drv2605l_lab_Response_result_tag;
        resp->response_type.result.error_code = drv2605l_lab_stop();
        break;
    default:
        resp->which_response_type = cormoran_drv2605l_lab_Response_result_tag;
        resp->response_type.result.error_code = -EINVAL;
        break;
    }
    return true;
}
