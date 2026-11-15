"""Static language tables for the cryptanalysis scorers.

These are ordinary frequency tables for English text — the kind every classical
cryptanalysis primer prints. They let the breakers recognise plausible English
plaintext among thousands of candidate decryptions. Nothing here is secret or
tied to any target.
"""
from __future__ import annotations

# Relative letter frequencies of English prose, in percent, A..Z.
ENGLISH_FREQ = {
    "A": 8.167, "B": 1.492, "C": 2.782, "D": 4.253, "E": 12.702, "F": 2.228,
    "G": 2.015, "H": 6.094, "I": 6.966, "J": 0.153, "K": 0.772, "L": 4.025,
    "M": 2.406, "N": 6.749, "O": 7.507, "P": 1.929, "Q": 0.095, "R": 5.987,
    "S": 6.327, "T": 9.056, "U": 2.758, "V": 0.978, "W": 2.360, "X": 0.150,
    "Y": 1.974, "Z": 0.074,
}

# The most common English trigrams with integer weights roughly proportional to
# their frequency, used by the n-gram log-probability scorer that drives the
# substitution hill-climber. A few hundred trigrams give it enough signal; the
# other breakers also lean on letter-frequency chi-square and word hits.
TRIGRAMS = {
    "THE": 1811, "AND": 730, "ING": 720, "ENT": 420, "ION": 420, "HER": 360,
    "FOR": 340, "THA": 330, "NTH": 330, "INT": 320, "ERE": 310, "TIO": 310,
    "TER": 300, "EST": 280, "ERS": 280, "ATI": 260, "HAT": 260, "ATE": 250,
    "ALL": 250, "ETH": 240, "HES": 240, "VER": 240, "HIS": 240, "OFT": 220,
    "ITH": 210, "FTH": 210, "STH": 210, "OTH": 210, "RES": 210, "ONT": 200,
    "DTH": 200, "ARE": 200, "REA": 190, "EAR": 190, "WAS": 190, "SHE": 180,
    "ONE": 180, "YOU": 180, "WIT": 180, "THI": 180, "ANT": 170, "TTE": 95,
    "OUR": 170, "ITS": 160, "NCE": 160, "MEN": 160, "EVE": 160, "COM": 150,
    "ECT": 150, "CON": 150, "TED": 150, "ETT": 140, "VEN": 140, "RED": 140,
    "AIN": 140, "ESO": 70, "OUT": 140, "STA": 140, "NOT": 140, "HAD": 130,
    "ESS": 130, "CAN": 130, "WHI": 130, "GHT": 130, "RIN": 130, "HIN": 120,
    "ERA": 120, "TIN": 120, "ESE": 120, "PRO": 120, "ONS": 120, "ILL": 120,
    "ORE": 110, "PER": 110, "ESA": 110, "AST": 110, "USE": 110, "THO": 110,
    "EAN": 100, "ORT": 100, "ONA": 100, "ULD": 100, "ANC": 100, "TTH": 100,
    "LLY": 95, "OME": 95, "WHE": 95, "WOU": 90, "WER": 90, "THR": 90,
    "ESI": 85, "ICE": 85, "ACT": 85, "SIN": 85, "LES": 85, "STO": 80,
    "NDE": 85, "WOR": 80, "TOR": 80, "ORM": 80, "EST2": 1, "ATT": 80,
    "PLE": 75, "IES": 75, "HEY": 75, "ONL": 70, "VES": 70, "ROM": 70,
    "SOM": 70, "TIM": 70, "ARD": 70, "SEA": 65, "GET": 65, "DIN": 65,
    # a second band of common trigrams for better discrimination
    "END": 120, "ENC": 70, "ERT": 95, "EDT": 110, "OVE": 70, "EIN": 95,
    "FRO": 90, "HEM": 90, "IGH": 110, "LAN": 70, "LIN": 85, "MAN": 85,
    "NDT": 95, "NGT": 90, "OFA": 90, "OUN": 90, "OUL": 70, "PRE": 75,
    "RAN": 70, "RAT": 75, "RET": 70, "RIC": 65, "RST": 75, "SAN": 65,
    "SON": 70, "SSA": 55, "STE": 85, "TAN": 70, "TAT": 75, "TCH": 55,
    "TEN": 95, "TES": 85, "TON": 85, "TRE": 65, "URE": 95, "WAY": 60,
    "WIL": 85, "YOU2": 1, "ESH": 60, "HAN": 95, "HEA": 80, "HEC": 60,
    "HED": 70, "HEE": 55, "HEI": 60, "HEL": 60, "HEN": 95, "HEO": 55,
    "HER3": 1, "HEP": 50, "HER4": 1, "HES2": 1, "INA": 80, "INE": 95,
    "ING2": 1, "INS": 70, "ISA": 70, "IST": 80, "ITE": 75, "ITI": 70,
    "LLT": 55, "LYT": 55, "NAL": 60, "NAN": 55, "NDA": 70, "NDI": 70,
    "NDS": 65, "NED": 60, "NIN": 65, "NTE": 75, "NTI": 70, "OAN": 45,
    "ONC": 55, "OND": 70, "ONI": 55, "OON": 55, "ORA": 65, "ORD": 65,
    "ORS": 55, "OSE": 65, "OUG": 50, "OUR2": 1, "OUS": 70, "RAC": 55,
    "RDS": 50, "REC": 60, "REE": 60, "REN": 65, "RES2": 1, "RID": 45,
    "RIO": 45, "RSE": 55, "RTH": 60, "SAI": 55, "SAL": 50, "SED": 65,
    "SES": 60, "SIO": 60, "SOF": 55, "STI": 65, "STO2": 1, "TAL": 60,
    "TED2": 1, "TIC": 60, "TLE": 55, "TOT": 55, "TUR": 55, "VED": 50,
    "VIN": 50, "WAN": 55, "WHA": 65, "WHO": 55, "WIN": 55, "YIN": 50,
    "YOF": 50, "YTH": 55, "ETW": 45, "EWA": 45, "EWI": 45, "EYO": 45,
}
# Keep only real three-letter alphabetic keys (the "X2" entries above exist only
# to keep the literal free of duplicate keys and are dropped here).
TRIGRAMS = {k: v for k, v in TRIGRAMS.items() if len(k) == 3 and k.isalpha()}

# Common English words for the word-hit score and the substitution breaker's
# word bonus — the ranked high-frequency list, plus a few security terms.
from .words import WORDS_RANKED

COMMON_WORDS = frozenset(WORDS_RANKED) | frozenset("""
secret message attack defense cipher hack flag token password admin root shell
payload exploit vulnerability firewall malware ransomware phishing breach
""".split())

# Standard International Morse code, letter/digit -> dots and dashes.
MORSE = {
    "A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".", "F": "..-.",
    "G": "--.", "H": "....", "I": "..", "J": ".---", "K": "-.-", "L": ".-..",
    "M": "--", "N": "-.", "O": "---", "P": ".--.", "Q": "--.-", "R": ".-.",
    "S": "...", "T": "-", "U": "..-", "V": "...-", "W": ".--", "X": "-..-",
    "Y": "-.--", "Z": "--..", "0": "-----", "1": ".----", "2": "..---",
    "3": "...--", "4": "....-", "5": ".....", "6": "-....", "7": "--...",
    "8": "---..", "9": "----.", ".": ".-.-.-", ",": "--..--", "?": "..--..",
    "/": "-..-.", "-": "-....-", "(": "-.--.", ")": "-.--.-", "@": ".--.-.",
    ":": "---...", "=": "-...-", "+": ".-.-.", "'": ".----.", "!": "-.-.--",
}
MORSE_INV = {v: k for k, v in MORSE.items()}
