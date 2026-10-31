project("passnet").program(({v0, v1}) => {
const v2 = N.conv2d(v0, v1, null, {"stride": [1, 1], "padding": [0, 0], "dilation": [1, 1], "groups": 1});
const v3 = N.pad(v2, [2, 2, 2, 2], "constant", 0);
const v4 = N.unfold(v3, 2, 12, 8);
const v5 = N.unfold(v4, 3, 12, 8);
const v6 = N.reshape(v5, [8, 80, 4, 144]);
const v7 = N.transpose(N.transpose(v6, 1, 2), 2, 3);
const v8_0 = N.slice(v7, 3, 0, 16);
const v8_1 = N.slice(v7, 3, 16, 80);
const v9 = v8_0;
const v10 = v8_1;
const v11 = N.transpose(v9, 3, 2);
return {out0: v11, out1: v10};
}, {v0: k.tensor([1, 512, 16, 16], "f16"), v1: k.tensor([640, 512, 1, 1], "f16")});
