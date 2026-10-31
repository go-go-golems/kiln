project("passnet").program(({v0}) => {
const v1 = N.div(v0, 1.6817928305074292);
const v2 = N.transpose(v1, -1, -2);
return {out0: v2};
}, {v0: k.tensor([32, 4, 64, 8], "f32")});
