// Runs a kiln-program/1 export on a WebGPU device. One file with no dependencies and only erasable TypeScript, so a
// consumer vendors it byte-identical (with a header naming this source) and Node can strip its types for tests.
//
//   const prog = await KilnWebGpuProgram.create(device, exportJson);
//   const { s } = await prog.run({ x: vectors });       // Float32Array per output
//   prog.destroy();
//
// `create` refuses a program the device cannot run (workgroup size, workgroup memory, binding size, grid) with an
// error naming the limit, so a caller can fall back to its CPU path before anything is dispatched.

export type Dtype = "f32" | "u8";

export interface ProgramTensor { name: string; buffer: number; shape: number[]; dtype: Dtype }
export interface ProgramBuffer { id: number; dtype: Dtype; elements: number; bytes: number; name?: string | null; data?: string }
export interface ProgramKernel {
  name: string; identity: string; row: string; reads: number[]; writes: number;
  grid: number; block: number; smemBytes: number; dispatch: [number, number, number];
  wgsl: string; cuda: string;
}
export interface KilnProgram {
  format: "kiln-program/1"; name: string; codegen: string;
  params: Record<string, unknown>; inputs: ProgramTensor[]; outputs: ProgramTensor[];
  buffers: ProgramBuffer[]; kernels: ProgramKernel[];
}
export type InputData = Float32Array | Uint8Array | Uint8ClampedArray | ArrayLike<number>;

const STORAGE = 0x80, COPY_SRC = 0x04, COPY_DST = 0x08, MAP_READ = 0x01, MAP_MODE_READ = 0x01;

function decodeBase64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Bytes for one buffer: fp32 as is, u8 packed one byte per element and padded to whole words. */
function packed(buf: ProgramBuffer, data: InputData): Uint8Array<ArrayBuffer> {
  if (data.length !== buf.elements) throw new Error(`buffer ${buf.id} holds ${buf.elements} elements; got ${data.length}`);
  if (buf.dtype === "u8") {
    const out = new Uint8Array(buf.bytes);
    out.set(data instanceof Uint8Array || data instanceof Uint8ClampedArray ? data : Uint8Array.from(data as ArrayLike<number>));
    return out;
  }
  const f = data instanceof Float32Array ? data : Float32Array.from(data as ArrayLike<number>);
  return new Uint8Array(f.buffer as ArrayBuffer, f.byteOffset, f.byteLength);
}

/** The limits a program needs, checked against an adapter's or a device's; returns the first violation or null. */
export function unsupportedReason(program: KilnProgram, limits: GPUSupportedLimits): string | null {
  if (program.format !== "kiln-program/1") return `format ${program.format} is not kiln-program/1`;
  for (const k of program.kernels) {
    if (k.block > limits.maxComputeInvocationsPerWorkgroup || k.block > limits.maxComputeWorkgroupSizeX) return `${k.name}: ${k.block} threads per workgroup exceeds the device's ${Math.min(limits.maxComputeInvocationsPerWorkgroup, limits.maxComputeWorkgroupSizeX)}`;
    if (k.smemBytes > limits.maxComputeWorkgroupStorageSize) return `${k.name}: ${k.smemBytes} bytes of workgroup memory exceeds the device's ${limits.maxComputeWorkgroupStorageSize}`;
    if (k.dispatch[0] > limits.maxComputeWorkgroupsPerDimension || k.dispatch[1] > limits.maxComputeWorkgroupsPerDimension) return `${k.name}: dispatch ${k.dispatch.join("×")} exceeds ${limits.maxComputeWorkgroupsPerDimension} per dimension`;
    if (k.reads.length + 1 > limits.maxStorageBuffersPerShaderStage) return `${k.name}: ${k.reads.length + 1} storage buffers exceeds the device's ${limits.maxStorageBuffersPerShaderStage}`;
  }
  for (const b of program.buffers) if (b.bytes > limits.maxStorageBufferBindingSize) return `buffer ${b.id}: ${b.bytes} bytes exceeds the binding limit ${limits.maxStorageBufferBindingSize}`;
  return null;
}

export class KilnWebGpuProgram {
  readonly program: KilnProgram;
  private device: GPUDevice;
  private buffers: GPUBuffer[];
  private steps: { pipeline: GPUComputePipeline; bind: GPUBindGroup; dispatch: [number, number, number] }[];
  private staging = new Map<number, GPUBuffer>();
  private queue: Promise<unknown> = Promise.resolve();

  private constructor(device: GPUDevice, program: KilnProgram, buffers: GPUBuffer[], steps: KilnWebGpuProgram["steps"]) {
    this.device = device; this.program = program; this.buffers = buffers; this.steps = steps;
  }

  /** Compiles every kernel, allocates every buffer, and uploads the data constants. */
  static async create(device: GPUDevice, program: KilnProgram): Promise<KilnWebGpuProgram> {
    const why = unsupportedReason(program, device.limits);
    if (why) throw new Error(`kiln program ${program.name} cannot run here: ${why}`);
    const outputs = new Set(program.outputs.map((o) => o.buffer));
    const buffers: GPUBuffer[] = [];
    device.pushErrorScope("out-of-memory");
    device.pushErrorScope("validation");
    let steps: KilnWebGpuProgram["steps"] = [], failure: unknown = null;
    try {
      for (const b of program.buffers) {
        const g = device.createBuffer({ label: `${program.name}/buffer${b.id}${b.name ? "/" + b.name : ""}`, size: b.bytes, usage: STORAGE | COPY_DST | (outputs.has(b.id) ? COPY_SRC : 0) });
        buffers.push(g);
        if (b.data) device.queue.writeBuffer(g, 0, decodeBase64(b.data));
      }
      steps = await Promise.all(program.kernels.map(async (k) => {
        const module = device.createShaderModule({ label: k.name, code: k.wgsl });
        const pipeline = await device.createComputePipelineAsync({ label: k.name, layout: "auto", compute: { module, entryPoint: "main" } });
        const bind = device.createBindGroup({ label: k.name, layout: pipeline.getBindGroupLayout(0), entries: [...k.reads, k.writes].map((id, binding) => ({ binding, resource: { buffer: buffers[id] } })) });
        return { pipeline, bind, dispatch: k.dispatch };
      }));
    } catch (e) { failure = e; }
    // both scopes are popped on every path, so a device the caller keeps does not inherit them
    const verr = await device.popErrorScope(), merr = await device.popErrorScope();
    const err = verr || merr || failure;
    if (err) {
      for (const b of buffers) b.destroy();
      throw new Error(`kiln program ${program.name}: ${(err as { message?: string }).message ?? String(err)}`);
    }
    return new KilnWebGpuProgram(device, program, buffers, steps);
  }

  /** The GPU buffer behind an input or output, for a caller that chains it into its own passes. */
  buffer(name: string): GPUBuffer {
    const t = [...this.program.inputs, ...this.program.outputs].find((x) => x.name === name);
    if (!t) throw new Error(`no input or output ${name} in ${this.program.name}`);
    return this.buffers[t.buffer];
  }

  /** Queues an input upload. */
  write(name: string, data: InputData): void {
    const t = this.program.inputs.find((x) => x.name === name);
    if (!t) throw new Error(`no input ${name} in ${this.program.name}`);
    this.device.queue.writeBuffer(this.buffers[t.buffer], 0, packed(this.program.buffers[t.buffer], data));
  }

  /** Records every kernel, in launch order, into one compute pass of `encoder`. */
  encode(encoder: GPUCommandEncoder): void {
    const pass = encoder.beginComputePass({ label: this.program.name });
    for (const s of this.steps) { pass.setPipeline(s.pipeline); pass.setBindGroup(0, s.bind); pass.dispatchWorkgroups(...s.dispatch); }
    pass.end();
  }

  /** Uploads `inputs`, runs the program, and reads back the named outputs (all of them by default). Calls are serialised. */
  run(inputs: Record<string, InputData>, outputs: string[] = this.program.outputs.map((o) => o.name)): Promise<Record<string, Float32Array>> {
    const next = this.queue.then(() => this.runNow(inputs, outputs));
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async runNow(inputs: Record<string, InputData>, names: string[]): Promise<Record<string, Float32Array>> {
    for (const [name, data] of Object.entries(inputs)) this.write(name, data);
    const outs = names.map((name) => {
      const t = this.program.outputs.find((x) => x.name === name);
      if (!t) throw new Error(`no output ${name} in ${this.program.name}`);
      const b = this.program.buffers[t.buffer];
      let s = this.staging.get(b.id);
      if (!s) { s = this.device.createBuffer({ label: `${this.program.name}/read${b.id}`, size: b.bytes, usage: MAP_READ | COPY_DST }); this.staging.set(b.id, s); }
      return { name, id: b.id, bytes: b.bytes, stage: s };
    });
    const enc = this.device.createCommandEncoder({ label: this.program.name });
    this.encode(enc);
    for (const o of outs) enc.copyBufferToBuffer(this.buffers[o.id], 0, o.stage, 0, o.bytes);
    this.device.queue.submit([enc.finish()]);
    const result: Record<string, Float32Array> = {};
    for (const o of outs) {
      await o.stage.mapAsync(MAP_MODE_READ);
      result[o.name] = new Float32Array(o.stage.getMappedRange().slice(0));
      o.stage.unmap();
    }
    return result;
  }

  destroy(): void {
    for (const b of this.buffers) b.destroy();
    for (const s of this.staging.values()) s.destroy();
    this.staging.clear();
  }
}
