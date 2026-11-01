project("passnet").program(({v0, v1}) => {
const v2 = N.expect(N.cast(N.linear(N.cast(v0, "f32"), N.cast(v1, "f32"), null), "f16"), [1, 197, 576], "f16");
const v3 = N.expect(N.reshape(v2, [1, 197, 3, 4, 48]), [1, 197, 3, 4, 48], "f16");
const v4 = N.expect(N.transpose(N.transpose(N.transpose(v3, 0, 2), 1, 2), 2, 3), [3, 1, 4, 197, 48], "f16");
const v5_0 = N.expect(N.reshape(N.slice(v4, 0, 0, 1), [1, 4, 197, 48]), [1, 4, 197, 48], "f16");
const v5_1 = N.expect(N.reshape(N.slice(v4, 0, 1, 2), [1, 4, 197, 48]), [1, 4, 197, 48], "f16");
const v5_2 = N.expect(N.reshape(N.slice(v4, 0, 2, 3), [1, 4, 197, 48]), [1, 4, 197, 48], "f16");
const v6 = N.expect(v5_0, [1, 4, 197, 48], "f16");
const v7 = N.expect(v5_1, [1, 4, 197, 48], "f16");
const v8 = N.expect(v5_2, [1, 4, 197, 48], "f16");
const v9 = N.expect(N.transpose(v7, 2, 3), [1, 4, 48, 197], "f16");
return {out0: v6, out1: v9, out2: v8};
}, {v0: k.tensor([1, 197, 192], "f16"), v1: k.tensor([576, 192], "f16")});
