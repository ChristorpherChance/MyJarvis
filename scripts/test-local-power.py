import importlib.util
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('sampler',Path(__file__).with_name('local-power-sampler.py'))
sampler=importlib.util.module_from_spec(spec)
spec.loader.exec_module(sampler)
class PowerTests(unittest.TestCase):
    def test_energy_difference(self): self.assertEqual(sampler.average_power(1000000,11000000,20000000,2),5)
    def test_counter_wrap(self): self.assertEqual(sampler.average_power(19000000,1000000,20000000,2),1)
    def test_invalid_sample(self):
        with self.assertRaises(ValueError): sampler.average_power(0,5000000000,9000000000,1)
        with self.assertRaises(ValueError): sampler.average_power(0,1,10,0)
if __name__=='__main__': unittest.main()
