import torch
from operator import iadd
from runtime import TorchProgram
PROGRAMS = {
    (((1, 2048, 8, 8), 'f16'),): TorchProgram('/work/fourth-task/000.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((1, 2048, 8, 8), 'f32'),): TorchProgram('/work/fourth-task/001.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((1, 160, 64, 64), 'bf16'), ((1, 160, 64, 64), 'bf16'), ((1, 160, 64, 64), 'bf16')): TorchProgram('/work/fourth-task/002.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((128, 320, 32, 32), 'bf16'), ((128, 320, 32, 32), 'bf16'), ((128, 320, 32, 32), 'bf16')): TorchProgram('/work/fourth-task/003.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((32, 2048, 7, 7), 'f16'),): TorchProgram('/work/fourth-task/004.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((128, 160, 96, 96), 'f16'), ((128, 160, 96, 96), 'f16'), ((128, 160, 96, 96), 'f16')): TorchProgram('/work/fourth-task/005.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((1, 2048, 8, 8), 'bf16'),): TorchProgram('/work/fourth-task/006.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((1, 896, 14, 14), 'bf16'), ((1, 896, 14, 14), 'bf16')): TorchProgram('/work/fourth-task/007.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((128, 896, 16, 16), 'f16'), ((128, 896, 16, 16), 'f16')): TorchProgram('/work/fourth-task/008.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((128, 2048, 7, 7), 'bf16'),): TorchProgram('/work/fourth-task/009.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((32, 160, 56, 56), 'bf16'), ((32, 160, 56, 56), 'bf16'), ((32, 160, 56, 56), 'bf16')): TorchProgram('/work/fourth-task/010.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((32, 160, 64, 64), 'f32'), ((32, 160, 64, 64), 'f32'), ((32, 160, 64, 64), 'f32')): TorchProgram('/work/fourth-task/011.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((1, 896, 24, 24), 'bf16'), ((1, 896, 24, 24), 'bf16')): TorchProgram('/work/fourth-task/012.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((128, 896, 16, 16), 'bf16'), ((128, 896, 16, 16), 'bf16')): TorchProgram('/work/fourth-task/013.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((1, 896, 16, 16), 'f16'), ((1, 896, 16, 16), 'f16')): TorchProgram('/work/fourth-task/014.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((1, 896, 14, 14), 'f16'), ((1, 896, 14, 14), 'f16')): TorchProgram('/work/fourth-task/015.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((128, 320, 32, 32), 'f16'), ((128, 320, 32, 32), 'f16'), ((128, 320, 32, 32), 'f16')): TorchProgram('/work/fourth-task/016.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((1, 320, 28, 28), 'f32'), ((1, 320, 28, 28), 'f32'), ((1, 320, 28, 28), 'f32')): TorchProgram('/work/fourth-task/017.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((128, 896, 24, 24), 'f32'), ((128, 896, 24, 24), 'f32')): TorchProgram('/work/fourth-task/018.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((128, 2048, 12, 12), 'f32'),): TorchProgram('/work/fourth-task/019.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((1, 160, 56, 56), 'f32'), ((1, 160, 56, 56), 'f32'), ((1, 160, 56, 56), 'f32')): TorchProgram('/work/fourth-task/020.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((32, 320, 48, 48), 'f32'), ((32, 320, 48, 48), 'f32'), ((32, 320, 48, 48), 'f32')): TorchProgram('/work/fourth-task/021.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((1, 320, 28, 28), 'f16'), ((1, 320, 28, 28), 'f16'), ((1, 320, 28, 28), 'f16')): TorchProgram('/work/fourth-task/022.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((1, 160, 96, 96), 'f16'), ((1, 160, 96, 96), 'f16'), ((1, 160, 96, 96), 'f16')): TorchProgram('/work/fourth-task/023.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((1, 320, 28, 28), 'bf16'), ((1, 320, 28, 28), 'bf16'), ((1, 320, 28, 28), 'bf16')): TorchProgram('/work/fourth-task/024.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((128, 896, 14, 14), 'f16'), ((128, 896, 14, 14), 'f16')): TorchProgram('/work/fourth-task/025.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((128, 896, 14, 14), 'f32'), ((128, 896, 14, 14), 'f32')): TorchProgram('/work/fourth-task/026.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((1, 896, 16, 16), 'f32'), ((1, 896, 16, 16), 'f32')): TorchProgram('/work/fourth-task/027.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((128, 896, 14, 14), 'bf16'), ((128, 896, 14, 14), 'bf16')): TorchProgram('/work/fourth-task/028.kiln.json', include_paths=["/usr/local/cuda/include"]),
    (((1, 896, 14, 14), 'f32'), ((1, 896, 14, 14), 'f32')): TorchProgram('/work/fourth-task/029.kiln.json', include_paths=["/usr/local/cuda/include"]),
}
def pattern(x,y,z):
    value=y+z
    value=iadd(value,x)
    return value,value.mean((2,3),keepdim=True)
def replacement_args(x,y,z):
    return (y,z,x)
@torch.fx.wrap
def kiln_residual_mean(x,y,z):
    tensors=[]
    for value in (x,y,z):
        if isinstance(value,torch.Tensor):
            tensors.append(value)
        elif value != 0:
            raise ValueError("Only captured zero scalar additions supported")
    names={torch.float32:"f32",torch.float16:"f16",torch.bfloat16:"bf16"}
    key=tuple((tuple(value.shape),names[value.dtype]) for value in tensors)
    result=PROGRAMS[key](*tensors)
    return result["out0"],result["out1"]
def replacement_func():
    return kiln_residual_mean
