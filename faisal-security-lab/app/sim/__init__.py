"""Attack/defence simulation on a virtual network (محاكاة).

A deterministic cyber-range: red groups (recon, exploit, crypto, lateral
movement) against blue groups (detection, response, hardening), played turn by
turn on the in-memory network in network.py. The safe home for the "attack on
networks" the owner asked for — it is a simulation against built-in virtual
targets and never reaches a real host. See engine.run().
"""
from .engine import Simulation, run
from .network import build_range
from .scenarios import SCENARIOS, get_spec, scenario_names

__all__ = ["Simulation", "run", "build_range", "SCENARIOS", "get_spec",
           "scenario_names"]
