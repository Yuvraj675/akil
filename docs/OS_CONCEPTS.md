# Operating Systems Concepts

The core premise of AKIL is that high-level resource requests (CPU cores and memory bytes) do not fully capture how a process interacts with the underlying hardware and kernel. By tracking specific OS-level events via eBPF, AKIL can make smarter scheduling decisions.

Here are the key metrics AKIL tracks:

## 1. Cache Misses (Hardware Counters)
* **What it is:** When a CPU needs to read data, it checks its local L1/L2/L3 caches. If the data is not there, it must fetch it from main memory (RAM), which is significantly slower.
* **Why it matters:** Workloads that cause excessive cache misses ("cache thrashing") degrade performance not just for themselves, but for other workloads sharing the same CPU package, due to shared L3 caches and memory bandwidth saturation.
* **AKIL's Response:** AKIL penalizes placing cache-sensitive workloads on nodes that are already exhibiting high cache miss rates.

## 2. Lock Contention (Kernel Mutexes)
* **What it is:** Occurs when a thread attempts to acquire a lock (like a mutex) that is currently held by another thread, forcing the kernel to put the waiting thread to sleep.
* **Why it matters:** High lock contention usually indicates poor multi-threading scalability or a bottleneck in kernel resources (e.g., heavily congested network sockets or file systems).
* **AKIL's Response:** Workloads suffering from lock contention are given scheduling penalties to avoid compounding bottlenecks on already congested nodes.

## 3. Page Faults (Memory Management)
* **What it is:** A page fault occurs when a program tries to access a block of memory that is not currently mapped into its physical RAM (e.g., it has been swapped to disk, or it is mapped to a file on disk). 
* **Why it matters:** Major page faults require blocking disk I/O to resolve. High rates of page faults indicate severe memory pressure and disk contention.
* **AKIL's Response:** Nodes with high page fault rates are deprioritized by the scheduler, as placing new memory-intensive workloads there will likely lead to system-wide thrashing.

## 4. Context Switches (Process Scheduling)
* **What it is:** A context switch is the process of the OS saving the state of the currently running thread and loading the state of the next thread to run.
* **Why it matters:** While normal, excessive context switches (often caused by too many threads competing for too few CPU cores) lead to massive CPU overhead and degraded throughput.
* **AKIL's Response:** High context switch rates serve as an indicator of CPU overcommitment, and AKIL uses this to penalize the node during scheduling.
