import unittest

from op_pricing import quote_op


class QuoteOpTests(unittest.TestCase):
    def test_every_operation_is_free(self):
        self.assertEqual(quote_op("repair_imei", 5), 0)
        self.assertEqual(quote_op("bypass_frp", 20), 0)
        self.assertEqual(quote_op("samsung_factory_reset", 15), 0)
        self.assertEqual(quote_op("official_adb_devices", 0), 0)
        self.assertEqual(quote_op("samsung_detect", 0), 0)

    def test_rejects_a_negative_price(self):
        with self.assertRaises(ValueError):
            quote_op("repair_imei", -1)


if __name__ == "__main__":
    unittest.main()
