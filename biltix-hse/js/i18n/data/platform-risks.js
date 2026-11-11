/**
 * English data dictionary — AI risk platform — AI risk register, treatment tasks and alerts — js/data/platform-seed.js
 * Owner: A-DATA-EN (v3 Precision, CONTRACT.md §4). Generated from the seed; keep record ids in sync.
 * Shape: { <namespace>: { <recordId>: <mirror> }, terms: { <arabic>: <english> } }.
 * A mirror holds only the translatable text of a record, in the same shape (objects key-wise,
 * arrays index-wise, same length as the source). Stored enum values are not mirrored: display them
 * with i18n.label(enumNs, value) from js/i18n/enums.js. People and organisations referenced by
 * other records (owner, by, approver, …) are in `terms` — display them with i18n.term(str).
 */
export default {
  aiRisks: {
    AR1: {
      title: 'Uncapped delay damages in main contract CT-2026-014 §8.7',
      driverExplanation: 'Clause 8.7 imposes damages of 0.5% of the Contract Price (SAR 8.9 million) for each week of delay with no maximum. The schedule model forecasts a P80 slip of 106 days (~15 weeks), meaning exposure of nearly SAR 133 million — more than twice the planned profit margin (SAR 61 million). The missing cap is the main driver of the score (54% weight).',
      evidence: {
        excerpt: 'The Contractor shall pay delay damages of 0.5% of the Contract Price for each week of delay or part thereof, without any maximum.',
      },
      recommendation: {
        action: 'Negotiate an overall cap of 10% of the Contract Price and convert the damages to 0.1% per day as the sole remedy, linking the completion date to weather extensions (§19.1).',
        rationale: 'The cap turns open-ended exposure into a known maximum of SAR 178 million and aligns with Article 72 of the Government Tenders and Procurement Law.',
        impact: 'Reduces the score to ~45',
        alternatives: [
          'Buy delay in start-up (DSU) insurance with SAR 100 million cover',
          'Accelerate the critical path with two rebar shifts (cost ~SAR 9 million)',
        ],
      },
      responseParams: { Legal: { clauseRef: 'CT-2026-014 §8.7 and §8.4' } },
      history: [
        { text: 'Automatically detected — score 100 (Red), confidence 91%' },
        { text: 'Immediate escalation alert recorded — score above the critical threshold of 85; channels: email, Slack (routing only, not sent in this version)' },
        { text: 'Recommendation accepted and task MT-0201 assigned to Legal Counsel' },
        { text: 'First negotiation meeting held with the Employer; agreement in principle to discuss the cap in the 20 November round' },
      ],
      treatment: { plan: 'Negotiate a 10% cap on delay damages and convert them to 0.1% per day — CT-2026-014 §8.7' },
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR2: {
      overrides: [
        {
          fromAction: 'Request amendment of the term to 30 days with financing charges',
          toAction: 'Request amendment of the term to 30 days + arrange a SAR 150 million payment certificate financing facility',
          reason: 'Negotiation could take two months; we need immediate cash cover for subcontractor payments',
        },
      ],
      title: '90-day payment term with no late-payment compensation — CT-2026-014 §14.2',
      driverExplanation: 'Clause 14.2 gives the Employer 90 days to pay and waives any compensation for delay, while subcontractor payments (58% of the contract value) fall due within 30 days. The 60-day gap equals financing ~SAR 210 million of consecutive payment certificates, and the actual payment record shows an average of 97 days for the last four certificates.',
      evidence: {
        excerpt: 'The Employer shall pay each approved payment certificate within ninety (90) days ... and no interest or compensation shall be due for late payment.',
      },
      recommendation: {
        action: 'Request that the payment term be amended to 30 days from the Engineer\'s approval with SAIBOR + 2% financing charges for late payment, and arrange a SAR 150 million payment certificate financing facility as cover.',
        rationale: 'Closes the cash-flow gap with subcontractors and shifts financing cost to the Employer when payment is late.',
        impact: 'Reduces the score to ~40',
        alternatives: [
          'Early payment discount of 1.5% within 30 days',
          'Align subcontracts to 60 days (shifts the pressure to subcontractors)',
        ],
      },
      responseParams: { Legal: { clauseRef: 'CT-2026-014 §14.2 and §14.8' } },
      history: [
        { text: 'Automatically detected — score 80 (Red), confidence 93%' },
        { text: 'Recommendation edited: added a payment certificate financing facility as a parallel action' },
        { text: 'Bank credit facility approved (SAR 150 million); negotiation of the clause continues' },
      ],
      residualAssessment: {
        justification: 'The SAR 150M payment-certificate facility was approved, so the cash-flow impact drops; late payment stays likely until clause 14.2 is amended.',
      },
      treatment: {
        plan: 'Amend the payment term to 30 days + arrange a payment certificate financing facility (SAR 150 million)',
        evidence: [{ title: 'Bank approval of the SAR 150M payment-certificate facility' }],
      },
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR3: {
      title: 'Curtain wall installation start (A1100) slipping on the critical path',
      driverExplanation: 'Activity A1100 is critical with zero float and a planned finish of d+142, but the model forecasts d+170 (28 days late). Main driver: the subcontractor Gulf Façades Company is at 14% progress against 22% planned (scorecard 58/100); second driver: the mock-up is due within 26 days and the glass supplier has not yet been approved. Delay probability 0.71.',
      recommendation: {
        action: 'Split the façade installation into two parallel packages (Floors 8–11 and 12–15) with two crews, and approve the glass supplier within 7 days with conditional sample approval.',
        rationale: 'Parallel working recovers 12–18 of the 28 forecast days, depending on when the second batch arrives; approving the supplier removes the largest open dependency.',
        impact: 'Reduces the score to ~48',
        alternatives: [
          'Bring the façade start forward to the structurally complete floors (8–10) ahead of schedule',
          'Invoke the partial subcontractor replacement clause (§15.2)',
        ],
      },
      responseParams: {
        Procurement: {
          supplier: 'Gulf Façades Company',
          alternates: ['Modern Façades Company — Jeddah', 'Architectural Glass Factory — Dammam'],
        },
        PMO: { trend: 'Deteriorating over 3 weeks' },
      },
      history: [{ text: 'Automatically detected — score 80 (Red), confidence 84%' }],
    },
    AR4: {
      title: 'Exposed slab edges without edge protection — Floor 23 (3 consecutive days)',
      driverExplanation: 'The vision model detected the north and east slab edges on Floor 23 without edge protection in images from 3 consecutive daily reports (5–7 November), with 14 members of the pour crew present. The repetition (3 days) raised the score by 22 points; the risk overlaps with risk R-1001 in the safety register.',
      evidence: {
        excerpt: 'Daily report 2026-11-07 — image 14: Zone A, Floor 23, north edge; detection: worker < 2 m from an unprotected edge, no barrier, no visible harness (detection confidence 0.88).',
      },
      recommendation: {
        action: 'Stop pouring on Floor 23 until certified edge protection is installed on all three sides, and document the inspection with photos in BILTIX.',
        rationale: 'A fall from 90 m is the highest fatality risk on site; an engineering barrier removes the hazard instead of relying on PPE.',
        impact: 'Reduces the score to ~20',
        alternatives: ['Temporary horizontal lifeline system with full harnesses for the entire pour crew'],
      },
      responseParams: {
        Site: {
          location: 'Zone A — Floor 23, north and east edges',
          hazard: 'Fall from height',
          controls: ['Certified edge protection (EN 13374 Class A)', 'Horizontal lifelines', 'Work-at-height permit'],
        },
      },
      history: [
        { text: 'Automatically detected — score 80 (Red), confidence 88%' },
        { text: 'Recommendation accepted; task MT-0203 created (write-back to BILTIX PM simulated)' },
      ],
      treatment: { plan: 'Stop pouring on Floor 23 until edge protection is installed on all three sides and the inspection is documented' },
      dataQuality: {
        sourceName: 'BILTIX — Images',
        issues: [
          { text: '95.4% of records passed schema checks (target 97%)' },
          { text: 'Field completeness 91.4% (target 97%)' },
          { text: 'Data consistency 95% (target 97%)' },
          { text: 'Quarantined record awaiting review: IMG-S3-20261108-031' },
        ],
      },
    },
    AR5: {
      title: 'Single-source curtain wall supplier with order date passed — BQ-S1-08.01.040',
      driverExplanation: 'The curtain wall item (28,600 m²) depends on a single supplier (Gulf Façades Company) with financial health of 58/100 and a 110-day lead time. The calculated order date (need date d+96 − 110 days) was 14 days ago and the glass purchase order has not yet been issued. Every week of ordering delay passes straight into critical activity A1100.',
      evidence: {
        excerpt: 'Unitized curtain wall units — BoQ 28,600 m² · BIM 27,950 m² · Supplier: SUP4 (single source) · Lead time 110 days · Target order date passed by 14 days',
      },
      recommendation: {
        action: 'Issue the insulated glazing purchase order within 5 days, and qualify a second alternative supplier for 30% of the quantity as a fallback.',
        rationale: 'Stops the loss of supply days and breaks dependence on a single, financially weak supplier.',
        impact: 'Reduces the score to ~38',
        alternatives: [
          'Advance payment against a bank guarantee to speed up booking the production line',
          'Buy the glass directly from the factory and free-issue it to the subcontractor',
        ],
      },
      responseParams: {
        Procurement: {
          supplier: 'Gulf Façades Company',
          alternates: ['Modern Façades Company — Jeddah', 'Architectural Glass Factory — Dammam'],
        },
      },
      history: [{ text: 'Automatically detected — score 80 (Red), confidence 86%' }],
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR6: {
      title: 'Forecast budget overrun of SAR 118 million — CPI 0.94 (negative VAC)',
      driverExplanation: 'Cost performance index CPI = 0.94 and schedule performance index SPI = 0.90; estimate at completion EAC = SAR 1.968 billion against a budget of SAR 1.85 billion (VAC = −SAR 118 million). The two drivers: general overheads WBS 1.9 (+10.1% due to a 3.5-month schedule extension) and the concrete structure WBS 1.3 (+7% from a 16% rise in rebar prices over 12 months).',
      recommendation: {
        action: 'Re-plan general overheads to the forecast schedule (reduce site staff by 8% after the structure tops out) and lock the steel price for Floors 28–30 with a forward supply contract.',
        rationale: 'Tackles the two largest variance drivers together and avoids ~SAR 45 million of the forecast overrun.',
        impact: 'Reduces the score to ~52',
        alternatives: ['Request a change order for the weather extension (previously rejected as CO-031 — resubmit with weather evidence)'],
      },
      responseParams: { PMO: { trend: 'Deteriorating — CPI from 0.97 to 0.94 over 8 weeks', kpi: 'CPI 0.94 / EAC SAR 1.97 billion' } },
      history: [
        { text: 'Automatically detected — score 80 (Red), confidence 82%' },
        { text: 'Recommendation accepted and task MT-0204 assigned' },
      ],
      treatment: { plan: 'Re-plan general overheads and lock the steel price for Floors 28–30 with a forward supply contract' },
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR7: {
      title: 'Late permanent power connection for Building C (B2070) — utility approval at 94 days',
      driverExplanation: 'Critical activity B2070 (permanent power connection) is held up by the Saudi Electricity Company application submitted 94 days ago against a statutory period of 60 days (ratio 1.57). Every additional day of delay pushes back commissioning and taking over of Building C; delay probability 0.66 with an expected impact of 21 days, and the contract (§4.19) makes the Contractor bear the consequences of utility delays.',
      evidence: {
        excerpt: 'Permanent power connection request — Building C (13.8 kV transformer substation) · Submitted 94 days ago · Statutory period 60 days · Status: overdue — awaiting substation inspection scheduling',
      },
      recommendation: {
        action: 'Escalate formally through the Saudi Electricity Company key accounts office with a request to inspect the substation within 10 days, and submit an extension of time notice (§20.1) based on the overrun of the statutory period.',
        rationale: 'Corporate escalation usually cuts scheduling time to two weeks; the notice protects the Contractor from damages.',
        impact: 'Reduces the score to ~45',
        alternatives: ['Run Building C on temporary generators for commissioning (cost ~SAR 420 thousand/month)'],
      },
      responseParams: { Legal: { clauseRef: 'CT-2025-087 §4.19 and §20.1' }, PMO: { trend: 'Steady at red for 5 weeks' } },
      history: [
        { text: 'Automatically detected — score 80 (Red), confidence 87%' },
        { text: 'Standard alert for the project manager recorded; channels: email, Slack (routing only, not sent in this version)' },
        { text: 'Recommendation accepted; task MT-0205 — follow up with the electricity company and send the extension notice' },
        { text: 'Immediate escalation: inspection still not scheduled after 25 days of follow-up' },
      ],
      residualAssessment: {
        justification: 'The §20.1 extension-of-time notice was served, which reduces penalty exposure; the inspection delay stays likely until SEC schedules it.',
      },
      treatment: {
        plan: 'Escalate the Building C permanent power application with the Saudi Electricity Company and send an extension of time notice',
        evidence: [{ title: 'Escalation letter to SEC and §20.1 extension-of-time notice' }],
      },
    },
    AR8: {
      title: 'Lift technician shortfall threatens the Building A contractual date (B2040)',
      driverExplanation: 'Installation of the six lifts in Building A is at 71% against 88% planned, and the contractual date (§8.2 of the subcontract) is 36 days away. Resource RS4 shows 16 technicians available of 24 required (150% allocation). Delay probability 0.62 with a 14-day impact on taking over.',
      evidence: {
        excerpt: 'Lift installation and commissioning — Building A · % Complete 71 · Planned 88 · Finish d+36 · Baseline d+30 · Float 0 · Resource: lift technicians 16/24',
      },
      recommendation: {
        action: 'Bring in 8 technicians from the Financial Gateway Tower project team (lift installation there starts in 210 days) for 5 weeks.',
        rationale: 'The resources are available within the portfolio with no external contracting cost, and close the gap fully.',
        impact: 'Reduces the score to ~35',
        alternatives: [
          'Night shifts for the current team (+35% labour cost)',
          'Request a reinforcement team from the German supplier (14 days to arrive)',
        ],
      },
      responseParams: { PMO: { trend: 'Deteriorating', kpi: 'Utilisation 150%' } },
      history: [
        { text: 'Automatically detected — score 80 (Red), confidence 83%' },
        { text: 'Recommendation accepted; resource transfer between the two projects awaiting approval from both project managers' },
      ],
      treatment: { plan: 'Transfer 8 lift technicians from the Financial Gateway Tower project for 5 weeks' },
    },
    AR9: {
      title: 'Copper cable quantity 9.8% above the BoQ while copper prices rise',
      driverExplanation: 'XLPE 4 × 240 mm² cable item: BIM quantity 20,310 m against 18,500 m in the BoQ (+1,810 m = SAR 746 thousand at current prices). The impact is amplified because copper prices rose 23% over 12 months and the contract is fixed-price (§13.8), and the need date is within 25 days against a 35-day lead time — the order date has passed by 10 days.',
      evidence: {
        excerpt: 'XLPE copper cables 4 × 240 mm² · BoQ 18,500 m · BIM 20,310 m · Difference +9.8% · Unit rate SAR 412 · Supplier: Saudi Cable Company · Lead time 35 days',
      },
      recommendation: {
        action: 'Issue an immediate purchase order for the full BIM quantity at a price fixed for 60 days, and claim the quantity difference in the next payment certificate as a remeasurement item.',
        rationale: 'Fixing the price now protects against further copper increases (forecast +7% within 6 months), and direct supply avoids the critical path.',
        impact: 'Reduces the score to ~42',
        alternatives: ['Replace the sub-main feeder section with approved aluminium cables (18% saving)'],
      },
      responseParams: {
        Procurement: { supplier: 'Saudi Cable Company', alternates: ['Saudi Electrical Cables Company', 'Riyadh Cables Factory'] },
      },
      history: [{ text: 'Automatically detected — score 80 (Red), confidence 90%' }],
      dataQuality: {
        issues: [
          { text: 'Field completeness 95.3% (target 97%)' },
          { text: 'Data consistency 96.9% (target 97%)' },
          { text: 'Quarantined record awaiting review: BIM-S5-31.23.010' },
          { text: 'Quarantined record awaiting review: BIM-S1-08.01.040 v39' },
        ],
      },
    },
    AR10: {
      overrides: [
        {
          fromAction: 'Send a resident inspection team and tie the payment to the FAT milestone',
          toAction: 'Send a resident inspection team and tie the payment to the FAT milestone + standby contract for an alternative transformer',
          reason: 'The supplier may not deliver even with oversight; we need a plan B that avoids SAR 1.2 million per day in damages',
        },
      ],
      title: '33/380 kV transformer supply from a distressed supplier threatens the commercial operation date',
      driverExplanation: 'Activity C3010 (transformer supply) is on the critical path with zero float and a forecast finish of d+72 against a baseline of d+30. The supplier, National Transformers Company, has financial health of 47/100, a credit rating of C, 69% delivery performance and a 180-day lead time. Delay probability 0.78 with a 45-day impact that drives the chain from C3020 to C3030 (energisation and grid connection) and triggers damages of SAR 1.2 million per day.',
      evidence: {
        excerpt: 'National Transformers Company · Financial health 47 · Credit C · On-time delivery 69% · Purchase order PO-2026-0388: factory acceptance test (FAT) postponed for the second time — latest date d+41',
      },
      recommendation: {
        action: 'Send a resident inspection team to the supplier\'s factory and tie 30% of the next payment to the FAT milestone, with a standby contract for one transformer from an alternative supplier (150 days) to secure partial energisation.',
        rationale: 'Raises the probability of on-time delivery to 0.6 and secures the single-transformer energisation option, which removes 70% of the delay damages.',
        impact: 'Reduces the score to ~58',
        alternatives: [
          'Hire a 100 MVA mobile transformer from the Saudi Electricity Company for early energisation',
          'Call the supplier\'s bank performance guarantee and procure from an alternative source',
        ],
      },
      responseParams: {
        Procurement: {
          supplier: 'National Transformers Company',
          alternates: ['Saudi Transformers Company — Dammam', 'Hyundai Transformers Factory — Jubail'],
        },
        PMO: { trend: 'Deteriorating sharply', kpi: 'SPI 0.93 · P80 +82 days' },
      },
      history: [
        { text: 'Automatically detected — score 100 (Red), confidence 90%' },
        { text: 'Immediate escalation recorded — score 100 is at or above 85; channels: email, Slack, Teams (routing only, not sent in this version)' },
        { text: 'Recommendation edited: added a standby contract for a transformer from an alternative supplier' },
        { text: 'Resident inspection team at the factory for 10 days; FAT for the first transformer scheduled for d+41' },
      ],
      residualAssessment: {
        justification: 'Resident inspection team at the factory, payment tied to the FAT milestone and a back-up transformer contract; exposure stays high until FAT is passed.',
      },
      treatment: {
        plan: 'Resident inspection team at the transformer factory + tie payment to the FAT milestone + standby contract for an alternative transformer',
      },
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR11: {
      title: 'SAR 1.2 million per day damages tied to an operation date outside the Contractor\'s control — §8.7',
      driverExplanation: 'Clause 8.7 of the EPC contract applies damages of SAR 1.2 million for each day after the commercial operation date, capped at 15%, but that date depends on readiness of the 380 kV transmission substation (the grid connection agreement is at 121 days against a statutory 90). With a P80 slip of 82 days, exposure reaches SAR 98 million.',
      evidence: {
        excerpt: 'The Contractor shall pay damages of SAR 1,200,000 for each day of delay beyond the commercial operation date, capped at 15% of the Contract Price.',
      },
      recommendation: {
        action: 'Submit an extension of time notice based on the late grid connection agreement (an Employer-risk event) and negotiate a definition of an "adjusted commercial operation date" and a 10% cap.',
        rationale: 'Turns the largest delay component into a time-compensable event and reduces the cap by SAR 114 million.',
        impact: 'Reduces the score to ~50',
        alternatives: ['Side agreement on phased commercial operation (50% of capacity) that partly stops the damages'],
      },
      responseParams: { Legal: { clauseRef: 'CT-2025-102 §8.7, §8.5 and §20.1' } },
      history: [
        { text: 'Automatically detected — score 80 (Red), confidence 89%' },
        {
          text: 'Recommendation accepted; extension notice being prepared (task MT-0208) — reference document: transmission network correspondence',
        },
      ],
      treatment: {
        plan: 'Extension of time notice for the late grid connection agreement and negotiation of an "adjusted commercial operation date"',
      },
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR12: {
      title: 'PV module concentration on a single supplier with the third shipment 19 days late',
      driverExplanation: '19.6% of portfolio spend is with a single supplier (Shanghai Photovoltaic Panel Factory) with 74% delivery performance and financial health of 71. The third shipment (260 MW) is 19 days behind the PO-2026-0457 §5.1 schedule, and the supplier\'s damages cap (5% of the shipment, about SAR 2.7 million) does not cover even one day of the project\'s damages to NEOM.',
      evidence: {
        ref: 'SUP3 — PO-2026-0457 shipment 3',
        excerpt: 'Shanghai Photovoltaic Panel Factory · Share of spend 19.6% · Single source · On-time delivery 74% · Shipment 3: planned ETD d−24 · Actual: not shipped (19 days late) · Stated reason: shortage of TOPCon cells',
      },
      recommendation: {
        action: 'Qualify a second supplier for 25% of the remaining quantity (shipments 6–8) and amend §5.1 to raise the damages cap to 15% with a right to procure substitutes after 45 days.',
        rationale: 'Reduces concentration to 14.7% and creates real contractual pressure on the supplier.',
        impact: 'Reduces the score to ~45',
        alternatives: [
          'Resequence panel installation to bring forward the fully supplied North sector',
          'Buy 100 MW from regional distributors\' spot stock (+6% price)',
        ],
      },
      responseParams: {
        Procurement: {
          supplier: 'Shanghai Photovoltaic Panel Factory',
          alternates: ['Jiangsu Solar Cells Factory', 'Saudi Panel Manufacturing Company — Sudair'],
        },
        Legal: { clauseRef: 'PO-2026-0457 §5.1 and §3.2' },
      },
      history: [{ text: 'Automatically detected — score 80 (Red), confidence 85%' }],
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR13: {
      title: 'EAC exceeds budget by SAR 237 million — CPI 0.91 driven by the substation and panels',
      driverExplanation: 'Estimate at completion is SAR 2.637 billion against a budget of SAR 2.4 billion (VAC = −SAR 237 million). Drivers: the substation item WBS 3.4 forecast at +13.5% (rework of 33 kV cabling and late transformers) and the panels item WBS 3.2 forecast at +6.7% (price renegotiation for shipments 5–8 and a 1.4% rise in the yuan). CPI fell from 0.95 to 0.91 over 10 weeks.',
      recommendation: {
        action: 'Freeze non-contractual changes in WBS 3.4, submit change order CO-052 (SAR 41 million) for the late transmission substation, and fix the price formula for shipments 5–8 to the polysilicon index with a ±8% cap.',
        rationale: 'Recovers ~SAR 41 million contractually and limits the open-ended panel price, which accounts for 60% of the remaining variance.',
        impact: 'Reduces the score to ~55',
        alternatives: ['Move insurance cover for the cable rework to a CAR claim'],
      },
      responseParams: { PMO: { trend: 'Deteriorating — CPI from 0.95 to 0.91', kpi: 'CPI 0.91 / VAC −SAR 237 million' } },
      history: [
        { text: 'Automatically detected — score 80 (Red), confidence 86%' },
        { text: 'Recommendation accepted; task MT-0209 — freeze changes and submit CO-052' },
      ],
      treatment: { plan: 'Freeze changes in WBS 3.4, submit CO-052 and fix the price formula for shipments 5–8' },
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR14: {
      title: 'Crane lifting of panels with 46 km/h winds forecast — South sector',
      driverExplanation: 'The weather service forecasts north-westerly winds of 41–46 km/h on days two and three (delay risk 0.62–0.75) while crane installation of structures and panels continues in blocks 7–12. Site intelligence recorded two near misses with unsecured panels blown away on 3 and 6 November, and the lift plan has not been updated with a wind stop limit (standard: stop lifting at 38 km/h).',
      evidence: {
        ref: 'NCM-NEOM-7D · report 2026-11-06',
        excerpt: 'Forecast wind speed: d+1 41 km/h · d+2 46 km/h (gusts 60) · Dust: high · Daily report 2026-11-06: "Unsecured panel blown off the platform by wind — no injuries"',
      },
      recommendation: {
        action: 'Suspend all lifting in the South sector on days two and three and move the crew to final fixing of installed panels and cable connections, adding a 38 km/h stop limit to the lift plan.',
        rationale: 'Removes the exposure during the risk window and turns the time into productive work that is not wind-sensitive.',
        impact: 'Reduces the score to ~25',
        alternatives: ['Fit a wind gauge linked to an alarm on every crane, with the operator authorised to stop'],
      },
      responseParams: {
        Site: {
          location: 'Panel field — South sector, blocks 7–12',
          hazard: 'Suspended loads falling / panels blown by wind',
          controls: ['Stop lifting at 38 km/h', 'Secure panels immediately after installation', 'Exclusion zone under loads'],
        },
      },
      history: [{ text: 'Automatically detected — score 80 (Red), confidence 84%' }],
      dataQuality: { sourceName: 'National Center for Meteorology (NCM)' },
    },
    AR15: {
      title: 'Performance ratio test methodology undefined — §9.4 (dispute likely at acceptance)',
      driverExplanation: 'Clause 9.4 requires a performance ratio of 84% or more using the "generally accepted methodology" without naming IEC 61724-1 or defining the measurement period or temperature correction. The difference between the two methodologies at NEOM temperatures can reach 1.6 percentage points, and each point equals a performance penalty of ~SAR 9 million; the test procedure submitted for approval is 13 days late.',
      evidence: {
        excerpt: 'The Contractor guarantees a plant performance ratio of at least 84% at the performance test, calculated according to the "generally accepted methodology".',
      },
      recommendation: {
        action: 'Agree an interpretative addendum specifying IEC 61724-1 with temperature correction, a 15-day period, a 600 W/m² irradiance threshold and exclusion of grid curtailment hours before the test procedure is approved.',
        rationale: 'Removes the ambiguity before it becomes a dispute at acceptance and protects ~SAR 14 million in performance penalties.',
        impact: 'Reduces the score to ~30',
        alternatives: ['Appoint an agreed independent Owner\'s Engineer to arbitrate the methodology'],
      },
      responseParams: { Legal: { clauseRef: 'CT-2025-102 §9.4 and §9.1' } },
      history: [
        { text: 'Automatically detected — score 80 (Red), confidence 88%' },
        { text: 'Recommendation accepted; interpretative addendum being drafted (MT-0210)' },
        { text: 'Draft addendum sent to the Employer; awaiting the consultant\'s response' },
      ],
      residualAssessment: {
        justification: 'The interpretation addendum for the IEC 61724-1 method is under negotiation; the impact is unchanged until it is signed.',
      },
      treatment: { plan: 'Interpretative addendum on the performance ratio test methodology (IEC 61724-1) — §9.4' },
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR16: {
      title: 'Unauthorised entry into the steel erection area — Warehouse 3',
      driverExplanation: 'Site cameras recorded 7 entries without a badge into the Warehouse 3 lifting area within 48 hours (4 of them port truck drivers taking a shortcut). Loads of up to 9 tonnes are suspended over the area, and the repetition over two days raised the score by 18 points; contract clause 4.8 makes the Contractor bear any stoppage imposed by the Saudi Ports Authority.',
      evidence: {
        excerpt: 'Gate G2 — 7 crossings without a badge (2026-11-07: 3 · 2026-11-08: 4); plate matching: 4 trucks belonging to the port operator · Frame at 11:42: worker under a suspended load',
      },
      recommendation: {
        action: 'Physically close gate G2 with a barrier and divert port trucks to the eastern service road in coordination with the port operator, with a gate marshal posted during lifting.',
        rationale: 'Physical segregation immediately removes the cause of 57% of entries (the shortcut).',
        impact: 'Reduces the score to ~22',
        alternatives: ['Smart gate with RFID badges linked to the attendance system'],
      },
      responseParams: {
        Site: {
          location: 'Warehouse 3 — Lifting area, gate G2',
          hazard: 'Suspended loads / struck by vehicle — unauthorised entry',
          controls: ['Physical barrier at G2', 'Gate marshal during lifting', 'Divert port trucks'],
        },
      },
      history: [
        { text: 'Automatically detected — score 80 (Red), confidence 86%' },
        { text: 'Recommendation accepted; task MT-0211 created (simulated write-back to BILTIX PM pending)' },
      ],
      treatment: { plan: 'Close gate G2, divert port trucks and post a gate marshal during lifting' },
      dataQuality: {
        sourceName: 'BILTIX — Images',
        issues: [
          { text: '95.4% of records passed schema checks (target 97%)' },
          { text: 'Field completeness 91.4% (target 97%)' },
          { text: 'Data consistency 95% (target 97%)' },
          { text: 'Quarantined record awaiting review: IMG-S3-20261108-031' },
        ],
      },
    },
    AR17: {
      title: 'Unforeseeable ground conditions borne by the Contractor with the notice period expiring in 3 days',
      driverExplanation: 'Clause 4.12 transfers all ground risk to the Contractor although the soil report covers only 38% of the excavation area, and 11 days ago hard limestone was found in Package 2B that raises excavation cost 2.4 times (proposed change order CO-021 = SAR 62.8 million). Clause 20.1 time-bars any claim 14 days after becoming aware of the event — 3 days remain.',
      evidence: {
        excerpt: '§4.12: The Contractor bears the full risk of geotechnical conditions, whatever they may be. §20.1: The Contractor loses its right to any extension or compensation unless it gives written notice within 14 days of becoming aware of the event.',
      },
      recommendation: {
        action: 'Send the notice of claim within 48 hours based on the inadequacy of the baseline soil report (38% coverage) and the principle against unjust enrichment, and request negotiation of a Geotechnical Baseline Report (GBR) and risk sharing.',
        rationale: 'Preserves the right before it is time-barred and opens the way to compensation of SAR 62.8 million.',
        impact: 'Reduces the score to ~55',
        alternatives: ['Request independent technical arbitration on rock classification before negotiating'],
      },
      responseParams: { Legal: { clauseRef: 'CT-2026-041 §4.12, §20.1 and §13.2' } },
      history: [
        { text: 'Automatically detected — score 100 (Red), confidence 92%' },
        { text: 'Immediate escalation recorded — score 100 is at or above 85; channels: email, Slack (routing only, not sent in this version)' },
        { text: 'Recommendation accepted; task MT-0212 assigned to Legal Counsel' },
        { text: 'Draft notice ready; awaiting the attached geotechnical laboratory report' },
      ],
      treatment: { plan: 'Send the notice of claim for unforeseeable geotechnical conditions before the deadline lapses (§20.1)' },
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR18: {
      title: 'Package 2B rock excavation at 17% against 31% planned — forecast slip of 63 days',
      driverExplanation: 'Critical activity E5010 (1.7 million m³ of blast excavation) is only 17% complete against 31% planned since the hard limestone was found; subcontractor productivity has dropped 55%, its scorecard is 49/100 with 6 open notices, and blasting technicians are at 6 of 10 (167%). Delay probability 0.84 with a 63-day impact that passes entirely to backfill and roads (E5020/E5030) and threatens the first interim milestone with SAR 26.8 million in damages.',
      evidence: {
        excerpt: 'Rock excavation by blasting — Package 2B · % Complete 17 · Planned 31 · Finish d+58 · Baseline d+40 · Float 0 · Delay probability 0.84 · Expected delay 63 d · Subcontractor SC8 scorecard 49',
      },
      recommendation: {
        action: 'Add a second excavation front with a second blasting contractor in the southern part of 2B and move some rippable rock to excavators with hydraulic breakers, revising the backfill sequence to start on completed sections.',
        rationale: 'Recovers ~35 of the 63 days and reduces dependence on a poorly performing subcontractor.',
        impact: 'Reduces the score to ~60',
        alternatives: [
          'Two shifts with night blasting (requires an additional permit)',
          'Redefine the first milestone by agreement with the Employer in exchange for waiving the weather claim',
        ],
      },
      responseParams: {
        Procurement: {
          supplier: 'Arabian Excavation Company',
          alternates: ['Al-Jazeera Blasting and Quarries Company', 'Al-Sukhour Contracting Establishment'],
        },
        PMO: { trend: 'Deteriorating sharply', kpi: 'SPI 0.82 · P80 +162 days' },
      },
      history: [
        { text: 'Automatically detected — score 100 (Red), confidence 91%' },
        { text: 'Immediate escalation — score 100 is at or above 85' },
        { text: 'Recommendation accepted; task MT-0213 — tender the second excavation front' },
        { text: 'Two offers received for the second excavation front; award within 5 days' },
      ],
      residualAssessment: {
        justification: 'A second excavation front with a second blasting contractor has been running for a week; progress improved but is still below plan.',
      },
      treatment: {
        plan: 'Tender a second excavation front with a second blasting contractor and resequence backfill on completed sections',
      },
    },
    AR19: {
      title: 'SAR 62.8 million change order unapproved and earthworks item forecast at +21%',
      driverExplanation: 'Earthworks item WBS 5.2 is forecast at SAR 468 million against a budget of SAR 386 million (+21.2%) after 285,000 m³ was reclassified as hard rock. Change order CO-021 (SAR 62.8 million) has been "proposed" for 6 days and the contract transfers ground risk to the Contractor (§4.12); if it is rejected, the full amount becomes a non-recoverable overrun. CPI is currently 0.96 but the model forecasts 0.90 within two quarters.',
      evidence: {
        excerpt: 'Reclassification of excavation as hard rock — Package 2B (285,000 m³) · SAR 62,800,000 · Status: proposed · Time impact 63 days · Driver: unforeseeable geotechnical conditions',
      },
      recommendation: {
        action: 'Formally submit CO-021 with the geotechnical laboratory report and record the cost in management reserve pending a decision, freezing any new commitments in WBS 5.2 not linked to the critical path.',
        rationale: 'Establishes the contractual basis for compensation and prevents commitments from growing before the matter is decided.',
        impact: 'Reduces the score to ~55',
        alternatives: ['Split the change order into two tranches (rippable / blasting) to ease partial approval'],
      },
      responseParams: { Legal: { clauseRef: 'CT-2026-041 §4.12 and §13.2' } },
      history: [{ text: 'Automatically detected — score 80 (Red), confidence 85%' }],
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR20: {
      title: 'North excavation slope instability — movement of 14 mm/week exceeds the limit',
      driverExplanation: 'Inclinometer IN-2B-03 readings on the north face of Package 2B show 14 mm of movement over the last week (limit 5 mm/week), accelerating after two blasts on 4 and 6 November, with tension cracks seen in daily report images 3 m from the edge. 22 workers and 4 excavators work below the slope, and forecast wind and dust could hinder evacuation.',
      evidence: {
        excerpt: 'Inclinometer IN-2B-03: cumulative movement 41 mm · Weekly rate 14 mm (limit 5) · Movement towards the excavation · Image 22: tension cracks ~9 m long behind the crest',
      },
      recommendation: {
        action: 'Immediately evacuate a 25 m zone below the north face, stop blasting within 100 m, and carry out benching and rock bolting to the geotechnical engineer\'s design within 10 days, with daily monitoring.',
        rationale: 'An accelerating rate of movement indicates imminent collapse; evacuation removes human exposure immediately and stabilisation addresses the cause.',
        impact: 'Reduces the score to ~30',
        alternatives: ['Slope stability radar (SSR) with automatic alarms instead of manual monitoring'],
      },
      responseParams: {
        Site: {
          location: 'Main excavation area — Package 2B, north face',
          hazard: 'Slope collapse / geotechnical',
          controls: ['25 m evacuation', 'Stop blasting within 100 m', 'Slope benching and rock bolts', 'Daily inclinometer monitoring'],
        },
        PMO: { trend: 'New — critical', kpi: 'Movement rate 14 mm/week' },
      },
      history: [
        { text: 'Automatically detected — score 100 (Red), confidence 90%' },
        { text: 'Immediate escalation recorded — score 100 is at or above 85; channels: email, Slack, WhatsApp (routing only, not sent in this version)' },
        { text: 'Area evacuated and blasting stopped; recommendation accepted with task MT-0214' },
        { text: 'Geotechnical engineer on site; stabilisation design within 48 hours' },
      ],
      treatment: { plan: 'Evacuate 25 m below the north face, stop blasting within 100 m and design slope stabilisation' },
      dataQuality: { sourceName: 'Sensor gateway (MQTT)' },
    },
    AR21: {
      title: 'Rock excavation quantity in the model 20% above the BoQ — BQ-S5-31.23.010',
      driverExplanation: 'The excavation volume calculated from the digital terrain model is 1,705,000 m³ against 1,420,000 m³ in the BoQ (+285,000 m³ = SAR 13.7 million at the single rate of SAR 48/m³, and ~SAR 62.8 million if classified as hard rock). Cause: the original topographic survey used points at 50 m spacing and missed the rock outcrops.',
      evidence: {
        excerpt: 'Rock excavation by controlled blasting — Package 2B · BoQ 1,420,000 m³ · BIM/DTM 1,705,000 m³ · Difference +20.1% · Unit rate SAR 48',
      },
      recommendation: {
        action: 'Carry out a joint drone (LiDAR) topographic survey within 7 days to agree quantities with the Engineer, and link the result to change order CO-021.',
        rationale: 'The joint survey is the contractual basis for measurement (§14.1 of the subcontract) and settles the quantity dispute before the classification dispute.',
        impact: 'Reduces the score to ~40',
        alternatives: ['Agree quantities in stages after every 100,000 m³'],
      },
      history: [{ text: 'Automatically detected — score 80 (Red), confidence 87%' }],
      dataQuality: {
        issues: [
          { text: 'Field completeness 95.3% (target 97%)' },
          { text: 'Data consistency 96.9% (target 97%)' },
          { text: 'Quarantined record awaiting review: BIM-S5-31.23.010' },
          { text: 'Quarantined record awaiting review: BIM-S1-08.01.040 v39' },
        ],
      },
    },
    AR22: {
      title: 'Hearing protection not worn in the blasting area — 38% of workers (3 weeks)',
      driverExplanation: 'The vision model analysed 214 daily report images of the blasting and crusher area over 3 weeks: 38% of workers had no hearing protection and 12% no safety glasses, while noise sensors record 96–104 dB during breaking (limit 85). The weekly rate is unchanged despite two awareness walks — pointing to a supervision failure rather than an awareness gap.',
      evidence: {
        excerpt: 'Analysis of 214 images (weeks 44–46): no hearing protection 38% · no safety glasses 12% · Noise sensor NS-S5-02: 96–104 dB(A) during breaking · Trend: flat',
      },
      recommendation: {
        action: 'Set up a PPE checkpoint at the entrance to the blasting area with a subcontractor safety officer, and link PPE violations to the deduction clause in the subcontract (§4.9).',
        rationale: 'Control at the entry point has cut violations by 70% on similar sites; the contractual link addresses weak supervision.',
        impact: 'Reduces the score to ~30',
        alternatives: ['Replace impact breaking with an enclosed crusher (engineering control)'],
      },
      responseParams: {
        Site: {
          location: 'Blasting and crusher area — Package 2B',
          hazard: 'Noise > 85 dB(A) / flying fragments — PPE non-compliance',
          controls: ['PPE checkpoint', 'Subcontractor safety officer', 'Visual noise alarm'],
        },
      },
      history: [
        { text: 'Automatically detected — score 80 (Red), confidence 82%' },
        { text: 'Recommendation accepted; task MT-0215' },
        { text: 'Checkpoint operating for 4 days; non-compliance rate in the latest analysis 19%' },
      ],
      residualAssessment: { justification: 'PPE checkpoint at the blast-zone entrance; non-compliance fell to 6% in follow-up walks.' },
      treatment: {
        plan: 'PPE checkpoint at the blasting area entrance and link violations to the deduction clause',
        evidence: [{ title: 'PPE checkpoint log — blast-zone entrance' }],
      },
      dataQuality: {
        sourceName: 'BILTIX — Images',
        issues: [
          { text: '95.4% of records passed schema checks (target 97%)' },
          { text: 'Field completeness 91.4% (target 97%)' },
          { text: 'Data consistency 95% (target 97%)' },
          { text: 'Quarantined record awaiting review: IMG-S3-20261108-031' },
        ],
      },
    },
    AR23: {
      title: 'Shortage of certified medical gas technicians threatens network testing before the contractual date',
      driverExplanation: 'Critical activity F6010 (medical gas network — Floors 1–3) is at 74% and due at d+21, the same contractual date as acceptance testing (§9.1). Resource RS14 provides 9 of 14 certified technicians (156%), and the medical copper pipes were ordered 21 days after their order date. Delay probability 0.46 with an 8-day impact that carries into F6030 (acceptance) and then the completion certificate.',
      evidence: {
        excerpt: 'Medical gas network installation and testing — Floors 1–3 · % Complete 74 · Finish d+21 · Baseline d+16 · Float 0 · Resource: medical gas technicians 9/14',
      },
      recommendation: {
        action: 'Contract a team of 5 certified technicians (HTM 02-01) from the approved hospital supplier for 4 weeks and bring forward medical pipes from the Jeddah project stock (BQ-S2 surplus of 820 m).',
        rationale: 'Closes the resource and material gaps together within a week and protects the acceptance date.',
        impact: 'Reduces the score to ~35',
        alternatives: ['Staged acceptance testing (Floor 1 first) with the Engineer\'s approval'],
      },
      responseParams: {
        Procurement: {
          supplier: 'Saudi Cable Company (medical copper pipes)',
          alternates: ['United Medical Gases Company', 'Red Sea Residential Compound project stock'],
        },
      },
      history: [{ text: 'Automatically detected — score 80 (Red), confidence 81%' }, { text: 'Recommendation accepted; task MT-0216' }],
      treatment: { plan: 'Contract 5 certified medical gas technicians and transfer medical copper pipes from the Jeddah project' },
    },
    AR24: {
      title: '32 mm reinforcing steel: model quantity 8.5% above the BoQ',
      driverExplanation: 'The BIM quantity for Floors 24–30 is 1,996 t against 1,840 t in the BoQ (+156 t = SAR 498 thousand at today\'s price of SAR 3,190/t). The difference comes from change order CO-027 (thicker core walls), which is not yet reflected in the BoQ, and the rising steel trend (+16% over 12 months, forecast +4% over 6 months) increases the impact with every month of delay.',
      evidence: {
        excerpt: 'High-strength 32 mm reinforcing steel · BoQ 1,840 t · BIM 1,996 t · Difference +8.5% · Unit rate SAR 3,190 · Need date d+34 · Order date d+13',
      },
      recommendation: {
        action: 'Update the BoQ to the approved model after CO-027 and issue a purchase order for the full quantity before the order date (d+13) at a fixed price.',
        rationale: 'Prevents a material shortage on the critical path and locks the price before the expected increase.',
        impact: 'Reduces the score to ~25',
        alternatives: ['Buy in two batches with a fixed-price option on the second batch'],
      },
      responseParams: {
        Procurement: {
          supplier: 'Al-Rajhi Steel Factory',
          alternates: ['Al-Ittefaq Steel', 'Al-Rajhi Steel Industries Company — Jeddah Branch'],
        },
      },
      history: [{ text: 'Automatically detected — score 64 (Amber), confidence 90%' }],
      dataQuality: {
        issues: [
          { text: 'Field completeness 95.3% (target 97%)' },
          { text: 'Data consistency 96.9% (target 97%)' },
          { text: 'Quarantined record awaiting review: BIM-S5-31.23.010' },
          { text: 'Quarantined record awaiting review: BIM-S1-08.01.040 v39' },
        ],
      },
    },
    AR25: {
      title: 'Dust storms excluded from force majeure — 11 non-recoverable stoppage days',
      driverExplanation: 'Clause 19.1 expressly excludes dust storms from force majeure, while the site recorded 11 partial stoppage days in 2026 and change order CO-031 (SAR 6.9 million) was rejected on that basis. With uncapped delay damages (§8.7), every dust day becomes direct financial exposure; the weather service forecasts two days of heavy dust this week.',
      evidence: {
        excerpt: 'Normal weather conditions in the region, including sandstorms and dust storms, shall in no case be considered force majeure.',
      },
      recommendation: {
        action: 'Resubmit the extension claim under §8.4(c) "exceptionally adverse climatic conditions" with National Center for Meteorology evidence (2026 dust days exceed the 10-year average by 40%) instead of relying on force majeure.',
        rationale: 'Moves the legal basis of the claim to a clause that is not expressly excluded.',
        impact: 'Reduces the score to ~35',
        alternatives: ['Negotiate an addendum adopting a 500 m visibility threshold as the extension criterion'],
      },
      responseParams: { Legal: { clauseRef: 'CT-2026-014 §19.1, §8.4(c) and §20.1' } },
      history: [
        { text: 'Automatically detected — score 64 (Amber), confidence 84%' },
        { text: 'Standard alert — score 64 exceeded the threshold of 60' },
      ],
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR26: {
      title: 'Core wall thickness deviates 18 mm from the model — Floor 25',
      driverExplanation: 'Comparing the laser scan (2026-11-02) with the approved BIM model shows the west core wall on Floor 25 is 18 mm thinner than designed over 6.4 m (allowable tolerance in SBC 304: 12 mm). The deviation reduces concrete cover to the reinforcement and requires a structural review before the Floor 26 pour.',
      recommendation: {
        action: 'Urgent structural review of wall W-L25 by the designer and approval of a repair method (structural mortar repair layer or conditional acceptance), with the Floor 26 formwork inspected before the pour.',
        rationale: 'Prevents the deviation from carrying into the floors above and documents the engineering acceptance.',
        impact: 'Reduces the score to ~20',
        alternatives: ['Laser scan after every core pour instead of every 3 floors'],
      },
      responseParams: {
        Site: {
          location: 'Zone A — Core, Floor 25, west wall',
          hazard: 'As-built deviation from design — insufficient concrete cover',
          controls: ['Structural review', 'Approved repair', 'Formwork inspection before the pour'],
        },
      },
      history: [
        { text: 'Automatically detected — score 60 (Amber), confidence 83%' },
        { text: 'Recommendation accepted; task MT-0217 for the Technical Office and the designer' },
      ],
      treatment: { plan: 'Structural review of wall W-L25, approve the repair method and inspect the Floor 26 formwork' },
      dataQuality: {
        issues: [
          { text: 'Field completeness 95.3% (target 97%)' },
          { text: 'Data consistency 96.9% (target 97%)' },
          { text: 'Quarantined record awaiting review: BIM-S5-31.23.010' },
          { text: 'Quarantined record awaiting review: BIM-S1-08.01.040 v39' },
        ],
      },
    },
    AR27: {
      title: 'SAR 14.2 million triple-glazing change order pending approval for 16 days',
      driverExplanation: 'The Employer\'s request to change the insulated glazing specification to triple glazing (CO-034, SAR 14.2 million) has been pending approval for 16 days, while the glass purchase order must be issued within 5 days (risk AIR-1005). Buying to the new specification before approval leaves the Contractor with the difference if it is rejected, and waiting delays the façade.',
      evidence: {
        excerpt: 'Change of insulated glazing specification to triple glazing · SAR 14,200,000 · Status: pending approval for 16 days · Driver: Employer\'s request · Time impact 0',
      },
      recommendation: {
        action: 'Request a written instruction from the Engineer (§13.1) to proceed with procurement to the new specification within 5 days, or confirmation of the original specification.',
        rationale: 'A written instruction secures the right to compensation and breaks the dependency on the order date.',
        impact: 'Reduces the score to ~25',
        alternatives: ['Buy the original glass for Floors 8–15 and apply the new specification from Floor 16'],
      },
      responseParams: { Legal: { clauseRef: 'CT-2026-014 §13.1 and §13.3' } },
      history: [{ text: 'Automatically detected — score 48 (Amber), confidence 80%' }],
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR28: {
      title: 'No contractors\' all risks insurance for façade materials — CT-2026-021 §18.2',
      driverExplanation: 'The façade contract provides only third-party liability insurance (SAR 5 million) with no contractors\' all risks (CAR) insurance for materials worth ~SAR 140 million during storage and installation, and no professional indemnity insurance even though the subcontractor is responsible for the detailed design. The first shipment of units arrives on site within 80 days.',
      evidence: {
        excerpt: 'The Subcontractor shall maintain third-party liability insurance with a limit of SAR 5 million per occurrence.',
      },
      recommendation: {
        action: 'Add the subcontractor as a co-insured on the project CAR policy (endorsement) and require a professional indemnity policy of SAR 20 million before the first shipment.',
        rationale: 'An endorsement on the project policy is faster and cheaper than a separate policy and covers materials from the date of arrival.',
        impact: 'Reduces the score to ~20',
        alternatives: ['Require a separate CAR policy from the subcontractor'],
      },
      responseParams: { Legal: { clauseRef: 'CT-2026-021 §18.2 and §18.4' } },
      history: [
        { text: 'Automatically detected — score 64 (Amber), confidence 90%' },
        { text: 'Recommendation accepted; task MT-0218 — endorsement requested from the insurance broker' },
        { text: 'Endorsement quote received (additional premium SAR 420 thousand); awaiting Finance approval' },
      ],
      residualAssessment: {
        justification: 'The subcontractor was endorsed on the CAR policy; the professional-indemnity policy request is still open.',
      },
      treatment: { plan: 'Endorse the subcontractor onto the CAR policy and require a SAR 20 million professional indemnity policy' },
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR29: {
      title: '31-month fixed-price contract with no adjustment formula as copper rises 23%',
      driverExplanation: 'Clause 13.8 fixes prices for the full term; cable items (SAR 18 million) are affected by a 23% rise in copper over 12 months, equal to ~SAR 3.1 million that cannot be recovered under the contract.',
      evidence: {
        excerpt: 'Contract prices are fixed for the entire construction period and are not subject to any adjustment due to changes in material or labour prices.',
      },
      recommendation: {
        action: 'Submit a compensation claim under the Ministry of Finance circular on material price escalation, with a schedule of copper price differences from General Authority for Statistics indices.',
        rationale: 'Opens a route to compensation outside the contract wording for government contracts.',
        impact: 'Reduces the score to ~35',
        alternatives: ['Absorb the difference from the contingency reserve (SAR 9.4 million remaining)'],
      },
      history: [
        { text: 'Automatically detected — score 60 (Amber), confidence 82%' },
        {
          text: 'Risk dismissed: the Employer is not covered by the compensation circular (joint-stock company); the difference is absorbed from contingency and recorded in the cost forecast',
        },
      ],
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR30: {
      title: 'Porcelain tile batch fails specification (water absorption 0.8% > 0.5%)',
      driverExplanation: 'The fourth batch of porcelain tiles (12,400 m²) failed the water absorption test (0.8% against the 0.5% specification limit); the Indian supplier has 79% delivery performance. Change order CO-015 to replace it (SAR 1.12 million) has been proposed, and the quantity required by the model is 5% below the BoQ, which partly offsets the impact.',
      evidence: {
        ref: 'BQ-S2-09.03.050 · laboratory report LAB-2026-1187',
        excerpt: '60 × 60 porcelain tiles · Batch 4 (12,400 m²) · Water absorption 0.8% (limit 0.5%) · Status: non-compliant · BoQ 96,000 · BIM 91,200 (−5.0%)',
      },
      recommendation: {
        action: 'Reject the batch and replace it at the supplier\'s cost (§6.3 of the purchase order), switching 30% of the remaining quantity to an approved local supplier to avoid the 50-day lead time.',
        rationale: 'Puts the cost on the supplier and keeps finishing works in Building C moving.',
        impact: 'Reduces the score to ~20',
        alternatives: ['Accept the batch for dry areas (corridors) at a 25% discount'],
      },
      responseParams: {
        Procurement: {
          supplier: 'Rajasthan Tiles and Ceramics Factory',
          alternates: ['Saudi Ceramic Company', 'Al-Jawhara Ceramics Factory'],
        },
      },
      history: [
        { text: 'Automatically detected — score 48 (Amber), confidence 88%' },
        { text: 'Recommendation accepted; task MT-0219 — batch rejection notice sent to the supplier' },
      ],
      treatment: { plan: 'Reject tile batch 4 and replace it at the supplier\'s cost + a local supplier for 30% of the remainder' },
      dataQuality: {
        sourceName: 'BILTIX — Site reports',
        issues: [{ text: 'Field completeness 94.6% (target 97%)' }, { text: 'Data consistency 96.2% (target 97%)' }],
      },
    },
    AR31: {
      title: 'MEP and external works items forecast over budget (+5.4% and +13.2%)',
      driverExplanation: 'The MEP item (WBS 2.6) is forecast at SAR 156 million against 148 (+5.4%) due to repeated balancing tests and cable price differences, and the external works item (WBS 2.7) at +13.2% due to temporary generators while permanent power is delayed. The overall CPI of 0.98 is still within tolerance but trending down.',
      recommendation: {
        action: 'Charge the cost of temporary generators to the utility delay claim (§4.19/§20.1) and lock the remaining MEP purchase orders at current-month prices.',
        rationale: 'Turns the largest component of the variance into a recoverable claim.',
        impact: 'Reduces the score to ~30',
        alternatives: ['Review the scope of balancing tests with the subcontractor to reduce retesting'],
      },
      history: [{ text: 'Automatically detected — score 48 (Amber), confidence 79%' }],
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR32: {
      title: 'Final lift shipment arrives only 13 days before the commissioning date',
      driverExplanation: 'The last 4 lifts for Building A left Hamburg 6 days ago and reach Jeddah within 17 days (total lead time 140 days), leaving 13 days for installation and commissioning against the usual 21 days per batch. The third-party inspection body has not yet been booked (requires two weeks).',
      evidence: {
        excerpt: 'Machine-room-less lifts — 14 units · Shipment 3/3 (4 units): ETD Hamburg d−6 · ETA Jeddah d+17 · Contractual date d+31 · Lead time 140 days',
      },
      recommendation: {
        action: 'Pre-clear customs through the FASAH platform and book the inspection body today, and start installing guide rails and doors for the four lifts before the cars arrive.',
        rationale: 'Cuts 5–7 days from the gap and makes the date achievable.',
        impact: 'Reduces the score to ~35',
        alternatives: ['Air-freight critical electronic components (cars by sea)'],
      },
      responseParams: { Procurement: { supplier: 'European Elevators Company Ltd' } },
      history: [{ text: 'Automatically detected — score 64 (Amber), confidence 85%' }],
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR33: {
      title: 'Unhedged euro exposure on the two remaining lift payments (EUR 5.4 million)',
      driverExplanation: 'Purchase order PO-2026-0512 is priced in euros and paid at the rate on the payment date (§2.3); the euro rose 3.1% in 30 days (SAR 4.36) with a forecast of 4.41, an increase of ~SAR 730 thousand on the two remaining payments.',
      evidence: { excerpt: 'The price is set in euros and paid in Saudi riyals at the exchange rate on the date of each payment.' },
      recommendation: {
        action: 'Buy a forward contract for EUR 5.4 million maturing in 17 and 45 days.',
        rationale: 'Locks in the cost at a hedging cost of ~0.4%.',
        impact: 'Reduces the score to ~15',
        alternatives: ['Negotiate a fixed rate of SAR 4.30/EUR with the supplier'],
      },
      history: [
        { text: 'Automatically detected — score 64 (Amber), confidence 86%' },
        {
          text: 'Risk dismissed: the exposure is already hedged by a forward contract dated 2026-10-21 (treasury ref FX-2026-118) — it did not reach the engine because the Oracle ERP data in the scenario was out of date',
        },
      ],
      dataQuality: { sourceName: 'Exchange rates (SAMA)' },
    },
    AR34: {
      title: 'BESS containers: the model requires 64 containers against 60 in the BoQ',
      driverExplanation: 'The BIM model updated after the capacity increase request (CO-048) includes 64 BESS containers against 60 in the BoQ (+6.7% = SAR 27.6 million). The change order has been pending approval for 22 days and the Chinese supplier is a single source with a 120-day lead time; the order date for the additional containers is d+10.',
      evidence: {
        excerpt: '5 MWh lithium battery BESS containers · BoQ 60 · BIM 64 · Difference +6.7% · Unit rate SAR 6,900,000 · Supplier SUP14 (single source) · Lead time 120 days',
      },
      recommendation: {
        action: 'Tie issue of the additional purchase order to approval of CO-048 within 10 days, and request a written instruction from the Engineer to proceed if approval is delayed.',
        rationale: 'Protects against both a SAR 27.6 million purchase without contractual cover and missing the order date.',
        impact: 'Reduces the score to ~30',
        alternatives: ['Book the supplier\'s production line with a refundable deposit (3%)'],
      },
      responseParams: {
        Procurement: { supplier: 'Shenzhen Energy Storage Systems (BESS) Factory', alternates: ['Ningde Energy Storage Factory'] },
      },
      history: [{ text: 'Automatically detected — score 64 (Amber), confidence 87%' }],
      dataQuality: {
        issues: [
          { text: 'Field completeness 95.3% (target 97%)' },
          { text: 'Data consistency 96.9% (target 97%)' },
          { text: 'Quarantined record awaiting review: BIM-S5-31.23.010' },
          { text: 'Quarantined record awaiting review: BIM-S1-08.01.040 v39' },
        ],
      },
    },
    AR35: {
      title: 'Chinese yuan exposure equal to 22% of the budget (SAR 528 million) with no hedge',
      driverExplanation: '22% of the project budget (panels and batteries) is priced in yuan; the yuan rose 1.4% in 30 days (SAR 0.527) with a forecast of 0.531 (+0.8%). Each 1% rise equals ~SAR 5.3 million on the remaining payments (62% of the value).',
      evidence: {
        ref: 'FX-CNY · S3 exposure',
        excerpt: 'CNY/SAR 0.527 · 30-day change +1.4% · 30-day forecast 0.531 · Exposure SAR 606 million (portfolio), of which SAR 528 million on the NEOM project · Hedge ratio 0%',
      },
      recommendation: {
        action: 'Hedge 60% of the remaining yuan payments with forward contracts at staggered maturities (3/6/9 months).',
        rationale: 'Limits volatility on the largest currency exposure in the portfolio at a hedging cost of ~0.6%.',
        impact: 'Reduces the score to ~35',
        alternatives: ['Reprice shipments 5–8 in US dollars (pegged to the riyal) in the negotiation round'],
      },
      responseParams: {
        Procurement: { supplier: 'Shanghai Photovoltaic Panel Factory / Shenzhen BESS Factory', alternates: ['Repricing in US dollars'] },
      },
      history: [
        { text: 'Automatically detected — score 64 (Amber), confidence 81%' },
        { text: 'Standard alert — score 64 exceeded the threshold of 60' },
      ],
      dataQuality: { sourceName: 'Exchange rates (SAMA)' },
    },
    AR36: {
      title: 'South sector panel installation behind schedule with a 32-technician gap and strong winds',
      driverExplanation: 'Activity C3110 is at 46% against 54% planned (18 days of float); resource RS7 is short by 32 technicians (108%), and the weather service forecasts two wind stoppage days this week. Delay probability 0.52 with a 16-day impact that could consume the float and make the activity critical.',
      evidence: {
        excerpt: 'Panel installation — South sector (blocks 7–12) · % Complete 46 · Planned 54 · Float 18 · Delay probability 0.52 · Expected delay 16 d · Resource: installers 388/420',
      },
      recommendation: {
        action: 'Move 40 technicians from the North sector (83% complete, 25 days of float) to the South sector for 3 weeks, and schedule electrical connection works on windy days.',
        rationale: 'Uses the float available in the North to protect the South without external resources.',
        impact: 'Reduces the score to ~30',
        alternatives: ['Early shifts (05:00–11:00) to avoid peak winds'],
      },
      responseParams: {
        Site: {
          location: 'Panel field — South sector',
          hazard: 'Wind during installation',
          controls: ['Stop lifting at 38 km/h', 'Schedule electrical works on windy days'],
        },
      },
      history: [
        { text: 'Automatically detected — score 60 (Amber), confidence 80%' },
        { text: 'Recommendation accepted; task MT-0220 — redeploy technicians' },
      ],
      treatment: { plan: 'Move 40 technicians from the North sector to the South sector for 3 weeks' },
    },
    AR37: {
      title: 'PM10 dust limit exceeded four times in October — environmental report due within 9 days',
      driverExplanation: 'The environmental monitoring station in the South sector recorded PM10 above 340 µg/m³ (the daily limit) on 4 days in October, 3 of them during grading works without water spraying. The quarterly report to the National Center for Environmental Compliance is due within 9 days (§4.24) and the environmental permit is under renewal.',
      evidence: {
        ref: 'ENV-S3-PM10-02 · October 2026',
        excerpt: 'Daily PM10: 12 October 388 · 15 October 412 · 23 October 356 · 27 October 391 µg/m³ (limit 340) · Wind > 30 km/h on 3 of the 4 days',
      },
      recommendation: {
        action: 'Activate the dust suppression plan (water bowsers every two hours + chemical stabiliser on internal roads) and include the corrective actions in the quarterly report before the due date.',
        rationale: 'Addresses the cause of the exceedances and gives the Center evidence of compliance before the renewal decision.',
        impact: 'Reduces the score to ~25',
        alternatives: ['Temporary windbreaks around grading areas'],
      },
      responseParams: {
        Site: {
          location: 'Panel field — South sector, grading areas',
          hazard: 'Environmental non-compliance — PM10 dust',
          controls: ['Regular water spraying', 'Chemical road stabiliser', 'Stop grading when wind > 30 km/h'],
        },
      },
      history: [
        { text: 'Automatically detected — score 60 (Amber), confidence 85%' },
        { text: 'Recommendation accepted; task MT-0221 — dust suppression plan and quarterly report' },
      ],
      residualAssessment: {
        justification: 'Dust-suppression plan activated (water spraying and wind fences); last week\'s PM10 readings were within the limit.',
      },
      treatment: { plan: 'Activate the dust suppression plan and submit the Q3 quarterly environmental report' },
      dataQuality: { sourceName: 'Sensor gateway (MQTT)' },
    },
    AR38: {
      title: 'Export restrictions and customs duties excluded from force majeure — §19.1',
      driverExplanation: 'Clause 19.1 excludes changes in duties and export restrictions from the country of origin, while 60% of the panels and 100% of the BESS containers come from a single Chinese supplier. Any new export restrictions on cells or batteries fall entirely on the Contractor with no extension or price adjustment.',
      evidence: {
        excerpt: 'Changes in customs duties or export restrictions from the country of origin shall not be considered force majeure.',
      },
      recommendation: {
        action: 'Negotiate for new government restrictions on major equipment to be treated as a "change in laws" (§13.7) entitling an extension and price adjustment.',
        rationale: 'Addresses a clear contractual gap before it materialises.',
        impact: 'Reduces the score to ~35',
        alternatives: ['Diversify origin: qualify a panel supplier in Sudair (Saudi Arabia)'],
      },
      responseParams: {
        Legal: { clauseRef: 'CT-2025-102 §19.1 and §13.7' },
        Procurement: { supplier: 'Shanghai Photovoltaic Panel Factory', alternates: ['Saudi Panel Manufacturing Company — Sudair'] },
      },
      history: [{ text: 'Automatically detected — score 64 (Amber), confidence 80%' }],
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR39: {
      title: 'Steel price adjustment gap between the main contract (15%) and the subcontract (5%)',
      driverExplanation: 'Subcontract CT-2026-019 §13.8 compensates the steel contractor for price differences above 5%, while main contract CT-2026-008 §13.8 compensates the Contractor only above 15%. The structural steel index has risen 11% since signing; the current gap of ~SAR 4.4 million is borne by the main contractor alone.',
      evidence: {
        excerpt: 'Subcontract: "The Subcontractor may claim the steel price difference whenever the change exceeds 5%." Main contract: "Structural steel prices are not subject to any adjustment unless the index changes by more than 15%."',
      },
      recommendation: {
        action: 'Negotiate with the steel contractor to raise the threshold to 10% in return for faster payment at 30 days, and request a reduction of the main contract threshold to 10% by addendum.',
        rationale: 'Reduces the gap from 10 points to zero and aligns the terms back-to-back.',
        impact: 'Reduces the score to ~30',
        alternatives: ['Buy steel directly and free-issue it to the subcontractor for the remaining batches'],
      },
      responseParams: { Procurement: { supplier: 'Steel Contractors', alternates: ['Jubail Steel Structures Factory (direct supply)'] } },
      history: [
        { text: 'Automatically detected — score 64 (Amber), confidence 87%' },
        { text: 'Recommendation accepted; task MT-0222 — draft the threshold addendum' },
      ],
      treatment: { plan: 'Addendum adjusting the steel price threshold to 10% in both the main contract and the subcontract' },
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR40: {
      title: 'Insulated roof panels from a Turkish supplier as the lira falls, with medium financial health',
      driverExplanation: 'Sandwich panels (101,400 m² per the model, +3.5% over the BoQ) come from the Turkish Aluminium and Windows Company with financial health of 62 and 83% delivery performance; the lira\'s 4.2% fall in 30 days squeezes the supplier\'s liquidity (its imports are in dollars). The order date for the final batch (d−33) was met and the need date is d+27.',
      evidence: {
        excerpt: 'Turkish Aluminium and Windows Company · Financial health 62 · Delivery 83% · TRY −4.2% (30d) · Batch 3/3: in production · ETA d+19 · Need date d+27',
      },
      recommendation: {
        action: 'Request written confirmation of the shipping date with weekly production photos, and identify an alternative local supplier for 15% of the quantity as a fallback.',
        rationale: 'Low-cost oversight of a medium-risk supplier without changing the contract.',
        impact: 'Reduces the score to ~25',
        alternatives: ['Third-party pre-shipment inspection (PSI)'],
      },
      responseParams: {
        Procurement: {
          supplier: 'Turkish Aluminium and Windows Company',
          alternates: ['Insulated Panels Factory — Dammam', 'Kirby Building Systems'],
        },
      },
      history: [{ text: 'Automatically detected — score 48 (Amber), confidence 78%' }],
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR41: {
      title: 'Work on the Warehouse 2 roof without lifelines — two observations in weekly images',
      driverExplanation: 'The vision model detected two workers on the Warehouse 2 roof (12 m high) in images from 28 and 30 October without being clipped to the installed lifelines; the observation was repeated twice in one week.',
      evidence: {
        excerpt: 'Image 7 — Warehouse 2 roof: two workers at the panel edge, lifeline visible but not used, no harness (confidence 0.81)',
      },
      recommendation: {
        action: 'Stop roof work until the roofing crew is retrained on using lifelines, and assign a permanent safety officer on the roof.',
        rationale: 'An immediate administrative control with training targeted at the root cause.',
        impact: 'Reduces the score to ~15',
        alternatives: ['Safety nets below the work area'],
      },
      responseParams: {
        Site: {
          location: 'Warehouse 2 — Roof',
          hazard: 'Fall from 12 m',
          controls: ['Mandatory use of lifelines', 'Safety officer on the roof', 'Retraining'],
        },
      },
      history: [
        { text: 'Automatically detected — score 48 (Amber), confidence 81%' },
        { text: 'Recommendation accepted; task MT-0223' },
        { text: 'Task closed: 18 workers retrained and a safety officer appointed; no observations in the following week\'s images' },
      ],
      residualAssessment: {
        justification: '18 workers were retrained and a roof safety observer was assigned; no observations in the following week\'s photos.',
      },
      outcome: 'Task closed: 18 workers retrained and a safety observer assigned; no observations in the following week\'s photos.',
      treatment: {
        plan: 'Retrain the roofing crew on lifelines and assign a safety officer on the roof',
        evidence: [
          { title: 'Lifeline retraining attendance record — 18 workers' },
          { title: 'Following week\'s photos — warehouse 2 roof, no observations' },
        ],
      },
      dataQuality: {
        sourceName: 'BILTIX — Images',
        issues: [
          { text: '95.4% of records passed schema checks (target 97%)' },
          { text: 'Field completeness 91.4% (target 97%)' },
          { text: 'Data consistency 95% (target 97%)' },
          { text: 'Quarantined record awaiting review: IMG-S3-20261108-031' },
        ],
      },
    },
    AR42: {
      title: 'Explosives storage permit expires within 19 days and renewal has been in process for 8 days',
      driverExplanation: 'Renewal of the explosives storage and use permit (Explosives Department — Public Security) was submitted 8 days ago against a statutory period of 21 days, and the current permit expires within 19 days. Any gap between expiry and renewal would stop blasting on the critical path (E5010), which is already slipping by 63 days.',
      evidence: {
        excerpt: 'Renewal of the explosives storage and use permit · Authority: Public Security — Explosives Department · Submitted 8 days ago · Statutory period 21 days · Current permit expires d+19',
      },
      recommendation: {
        action: 'Daily follow-up with the liaison officer, and prepare a one-week contingency plan for mechanical excavation (hydraulic breakers) in case of a gap.',
        rationale: 'Prevents the critical front from stopping completely even if the renewal is late.',
        impact: 'Reduces the score to ~30',
        alternatives: ['Move the explosives stock to the supplier\'s licensed magazine with daily deliveries'],
      },
      responseParams: {
        Site: {
          location: 'Explosives magazine — Package 2B',
          hazard: 'Blasting stoppage / unlicensed storage',
          controls: ['Permit follow-up', 'Alternative mechanical excavation plan'],
        },
      },
      history: [
        { text: 'Automatically detected — score 64 (Amber), confidence 82%' },
        { text: 'Standard alert — score 64 exceeded the threshold of 60' },
      ],
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR43: {
      title: 'Diesel consumption of 1.9 million litres per month with a forecast price adjustment to SAR 1.52',
      driverExplanation: 'Excavation and haulage equipment consumes 1.9 million litres a month; the model forecasts a local price adjustment from SAR 1.38 to SAR 1.52/L within 4–5 months (+10%), i.e. +SAR 266 thousand per month for the remaining 30 months of earthworks, and the contract has no fuel adjustment formula.',
      evidence: {
        excerpt: 'Diesel fuel for excavation and haulage equipment · 1,900,000 L/month · Current price SAR 1.38/L · 6-month forecast: from 1.38 to 1.52 · Volatility 9.6%',
      },
      recommendation: {
        action: 'Include a fuel price variation clause in the next change order claim and improve fleet efficiency (GPS tracking of idle time — target 8% reduction).',
        rationale: 'Recovers part of the cost contractually and actually reduces consumption.',
        impact: 'Reduces the score to ~30',
        alternatives: ['Annual fixed-price supply contract with the supplier (3% premium)'],
      },
      responseParams: { Procurement: { supplier: 'Logistics Fuels Company', alternates: ['Aramco — direct supply to projects'] } },
      history: [{ text: 'Automatically detected — score 48 (Amber), confidence 74%' }],
      dataQuality: { sourceName: 'Commodity indices' },
    },
    AR44: {
      title: '14 dust storm stoppage days that cannot be recovered as time — §19.1',
      driverExplanation: 'Clause 19.1 treats dust storms as an expected condition that does not entitle any extension; the site has recorded 14 earthworks stoppage days since February (visibility below 1 km or wind above 40 km/h) and the weather service forecasts two more this week. With multiple milestone damages (§8.7), every day becomes financial exposure.',
      evidence: {
        excerpt: 'Dust storms and winds are expected conditions in the region and do not entitle the Contractor to any extension.',
      },
      recommendation: {
        action: 'Document stoppage days with official weather records and submit an extension claim based on exceeding the 10-year average (exceptional conditions §8.4), adding the item to the negotiation round on §4.12.',
        rationale: 'Combines the weather and ground claims into one stronger negotiation.',
        impact: 'Reduces the score to ~40',
        alternatives: ['Reschedule sensitive earthworks outside the windy season (March–May)'],
      },
      responseParams: { Legal: { clauseRef: 'CT-2026-041 §19.1 and §8.4' } },
      history: [{ text: 'Automatically detected — score 64 (Amber), confidence 83%' }],
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR45: {
      title: 'Road diversion change order (SAR 9.7 million) pending and equipment and fuel item at +13.4%',
      driverExplanation: 'Change order CO-018 to divert the internal haul road to protect an archaeological site (SAR 9.7 million, 18 days) has been pending approval for 30 days, and equipment and fuel item WBS 5.9 is forecast at SAR 161 million against 142 (+13.4%) due to haul distances 2.1 km longer and the diesel price forecast.',
      evidence: {
        excerpt: 'CO-018: Diversion of the internal haul road to protect an archaeological site · SAR 9,700,000 · Pending approval for 30 days · WBS 5.9: Budget 142,000,000 · Forecast 161,000,000 (+13.4%)',
      },
      recommendation: {
        action: 'Request approval of CO-018 as an Employer-risk event (Heritage Commission requirements) including the additional haulage cost, and update the haulage plan to shorten the distance with an approved temporary route.',
        rationale: 'Recovers the cost contractually and reduces the haulage component in WBS 5.9.',
        impact: 'Reduces the score to ~35',
        alternatives: ['Use conveyor belts for surplus material instead of trucks'],
      },
      history: [{ text: 'Automatically detected — score 60 (Amber), confidence 78%' }],
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR46: {
      title: 'Fence breaches near the blasting exclusion zone — herders and camels (3 times in a week)',
      driverExplanation: 'South perimeter cameras recorded 3 fence breaches this week (camels and herders) 180–260 m from the blasting area (exclusion zone 500 m); one came 40 minutes before a scheduled blast that was cancelled at the last moment. The fence in the South sector is 1.8 m barbed wire with no electronic monitoring.',
      evidence: {
        excerpt: 'South perimeter camera S4: 3 November 06:12 (4 camels) · 5 November 17:40 (herder + 9 camels, 180 m from the blasting area) · 8 November 07:05 (camels) · Fence condition: two 3 m gaps',
      },
      recommendation: {
        action: 'Repair the gaps within 48 hours and raise the south fence to 2.4 m with welded mesh, with patrols and an audible warning before every blast, and coordinate with the municipality to raise awareness among herders.',
        rationale: 'Closes the actual entry route and adds a procedural layer before every blast.',
        impact: 'Reduces the score to ~28',
        alternatives: ['Perimeter radar with automatic alerts to the control room'],
      },
      responseParams: {
        Site: {
          location: 'South perimeter — near the blasting exclusion zone',
          hazard: 'Unauthorised entry into a blasting area',
          controls: ['Repair and raise the fence', 'Patrol before blasting', 'Audible warning', 'Community awareness'],
        },
      },
      history: [
        { text: 'Automatically detected — score 64 (Amber), confidence 86%' },
        { text: 'Recommendation accepted; task MT-0224 — simulated write-back to BILTIX PM failed (timeout scenario)' },
      ],
      treatment: { plan: 'Repair the gaps in the south fence, raise it to 2.4 m and patrol before every blast' },
      dataQuality: {
        sourceName: 'BILTIX — Images',
        issues: [
          { text: '95.4% of records passed schema checks (target 97%)' },
          { text: 'Field completeness 91.4% (target 97%)' },
          { text: 'Data consistency 95% (target 97%)' },
          { text: 'Quarantined record awaiting review: IMG-S3-20261108-031' },
        ],
      },
    },
    AR47: {
      title: 'Medical systems acceptance criterion "to the Employer\'s satisfaction" — §9.1',
      driverExplanation: 'Clause 9.1 deems the project complete only when medical systems pass acceptance testing "to the Employer\'s satisfaction" with no reference to HTM 02-01 or NFPA 99; the subjective criterion opens the door to a delayed completion certificate (damages of 0.1% per day = SAR 402 thousand/day), and acceptance testing is scheduled within 21 days.',
      evidence: {
        excerpt: 'The project shall not be considered complete until all medical systems pass acceptance testing "to the Employer\'s satisfaction".',
      },
      recommendation: {
        action: 'Agree a signed joint test protocol (HTM 02-01 + NFPA 99) before testing starts, as an interpretative addendum to Clause 9.1.',
        rationale: 'Turns a subjective criterion into an objective one before it becomes contentious.',
        impact: 'Reduces the score to ~28',
        alternatives: ['Appoint an independent testing body accredited by the Ministry of Health'],
      },
      responseParams: { Legal: { clauseRef: 'CT-2025-066 §9.1 and §10.1' } },
      history: [
        { text: 'Automatically detected — score 64 (Amber), confidence 86%' },
        { text: 'Recommendation accepted; task MT-0225 — joint test protocol' },
        { text: 'Protocol sent to the Employer\'s consultant; review meeting at d+3' },
      ],
      residualAssessment: { justification: 'The draft joint acceptance protocol (HTM 02-01 + NFPA 99) is under review by the employer.' },
      treatment: { plan: 'Joint acceptance test protocol (HTM 02-01 + NFPA 99) as an addendum to Clause 9.1' },
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR48: {
      title: 'Medical copper pipes: 8.5% above the BoQ and order date passed by 21 days',
      driverExplanation: 'The medical copper pipe quantity in the model is 10,420 m against 9,600 m (+820 m = SAR 151 thousand); the need date is within 14 days and the lead time is 35 days, so the order date passed 21 days ago, and the specification (EN 13348) is under review with the supplier.',
      evidence: {
        excerpt: 'Medical copper pipes · BoQ 9,600 m · BIM 10,420 m · Difference +8.5% · Supplier: Saudi Cable Company · Lead time 35 days · Need date d+14 · Order date d−21 · Specification: under review',
      },
      recommendation: {
        action: 'Transfer 820 m of surplus from the Red Sea Residential Compound project (same specification) within 3 days and issue a purchase order for the remaining quantity immediately.',
        rationale: 'The internal transfer closes the time gap immediately with no urgent purchase cost.',
        impact: 'Reduces the score to ~22',
        alternatives: ['Urgent purchase from a local distributor (+12% price, 5 days)'],
      },
      responseParams: {
        Procurement: {
          supplier: 'Saudi Cable Company',
          alternates: ['Red Sea Residential Compound project stock', 'United Medical Gases Company'],
        },
      },
      history: [{ text: 'Automatically detected — score 64 (Amber), confidence 88%' }],
      dataQuality: {
        issues: [
          { text: 'Field completeness 95.3% (target 97%)' },
          { text: 'Data consistency 96.9% (target 97%)' },
          { text: 'Quarantined record awaiting review: BIM-S5-31.23.010' },
          { text: 'Quarantined record awaiting review: BIM-S1-08.01.040 v39' },
        ],
      },
    },
    AR49: {
      title: 'Planned power shutdown inside an operating hospital — life systems in the existing building',
      driverExplanation: 'Activity F6020 (electrical tie-in with the existing building) requires a planned 6-hour shutdown within 20 days affecting boards that supply intensive care and the lifts; the shutdown schedule has not yet been approved by hospital management (§4.6 makes the Contractor bear uncapped operating costs) and standby generator 2 has not been tested under full load.',
      evidence: {
        excerpt: 'Electrical tie-in with the existing building (planned shutdown) · Start d+20 · Finish d+24 · Baseline d+18 · Float 0 · Delay probability 0.52 · Dependency: shutdown schedule not approved',
      },
      recommendation: {
        action: 'Agree the shutdown schedule with hospital management within 8 days (night window 00:00–06:00) and test both generators under full load, with a third mobile standby generator and a joint control point during the shutdown.',
        rationale: 'Removes the risk of interrupting life systems and limits uncapped contractual exposure.',
        impact: 'Reduces the score to ~22',
        alternatives: ['Phased tie-in via a temporary changeover board without a full shutdown'],
      },
      responseParams: {
        Site: {
          location: 'Existing building — Tie-in area, main switchboard room',
          hazard: 'Loss of life-safety systems / electrical',
          controls: ['Approved night window', 'Generator load testing', 'Third standby generator', 'Joint control room'],
        },
      },
      history: [{ text: 'Automatically detected — score 60 (Amber), confidence 80%' }, { text: 'Recommendation accepted; task MT-0226' }],
      treatment: { plan: 'Agree the night shutdown schedule with hospital management and test the generators under full load' },
    },
    AR50: {
      title: 'Medical systems and general overheads slightly over budget (+4.1% and +6.5%)',
      driverExplanation: 'Medical systems item WBS 6.5 is forecast at SAR 77 million against 74 (+4.1%) due to the two added isolation rooms (CO-033 approved), and general overheads WBS 6.9 at +6.5% due to a 3-week schedule extension. CPI 0.99 is within tolerance.',
      recommendation: {
        action: 'Confirm that the cost of the isolation rooms is fully covered by CO-033, and submit night work change order CO-036 to cover the extension of general overheads.',
        rationale: 'Both variances are contractually recoverable.',
        impact: 'Reduces the score to ~20',
      },
      history: [{ text: 'Automatically detected — score 40 (Amber), confidence 77%' }],
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR51: {
      title: 'Medical systems acceptance testing (F6030) with a delay probability of 0.57 and a 12-day impact',
      driverExplanation: 'Critical activity F6030 starts at d+25 and finishes at d+70 against a baseline of d+60; it depends on completion of the gas network (F6010, technician gap), the electrical tie-in (F6020, unapproved schedule) and a test protocol not yet agreed (§9.1). Delay probability 0.57 with a 12-day impact that reaches the completion certificate directly.',
      evidence: {
        excerpt: 'Medical systems acceptance testing and handover documentation · Start d+25 · Finish d+70 · Baseline d+60 · Float 0 · Delay probability 0.57 · Predecessors: F6010, F6020',
      },
      recommendation: {
        action: 'Split acceptance into packages (Floor 1, then 2, then 3) starting as soon as each floor is complete, and prepare the operation and maintenance documents in parallel.',
        rationale: 'Breaks the sequential dependency and recovers ~8 days.',
        impact: 'Reduces the score to ~32',
        alternatives: ['Internal pre-commissioning two weeks before formal acceptance'],
      },
      responseParams: { PMO: { trend: 'Stable' } },
      history: [{ text: 'Automatically detected — score 60 (Amber), confidence 79%' }],
    },
    AR52: {
      title: 'Tower crane 3 climbing (A1140) during forecast windy days',
      driverExplanation: 'The climbing of tower crane 3 is scheduled up to d+11 and coincides with two days of 38–42 km/h winds (the stop limit for self-climbing operations is 36 km/h). The activity is not critical, with 6 days of float, and the expected 4-day delay stays within the float.',
      evidence: {
        excerpt: 'Tower crane 3 installation and climbing · % Complete 45 · Finish d+11 · Baseline d+9 · Float 6 · Weather-sensitive · Delay probability 0.33',
      },
      recommendation: {
        action: 'Bring the climb forward to day one (wind 18 km/h) and postpone non-critical installation works to the two windy days.',
        rationale: 'Using the calm window consumes zero float.',
        impact: 'Reduces the score to ~15',
      },
      responseParams: {
        Site: {
          location: 'Tower crane 2/3 — Zone A',
          hazard: 'Wind during crane climbing',
          controls: ['36 km/h stop limit', 'Anemometer on the jib'],
        },
      },
      history: [{ text: 'Automatically detected — score 36 (Green), confidence 80%' }],
    },
    AR53: {
      title: 'Equipment and tower cranes item forecast at +3.1% due to the rental extension',
      driverExplanation: 'WBS 1.2 is forecast at SAR 66 million against 64 (+3.1%) because the two cranes\' rental was extended by two months as the structure slipped; the impact is limited and within the item\'s contingency (5%).',
      evidence: {
        excerpt: 'Equipment and tower cranes · Budget 64,000,000 · Actual 39,000,000 · Committed 52,000,000 · Forecast 66,000,000 (+3.1%)',
      },
      recommendation: {
        action: 'Negotiate a reduced rental rate for the additional months (8% long-term discount).',
        rationale: 'Brings the item roughly back within budget.',
        impact: 'Reduces the score to ~15',
      },
      history: [{ text: 'Automatically detected — score 32 (Green), confidence 83%' }],
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR54: {
      title: 'C60 concrete: model quantity within tolerance (+1.7%) and specification compliant',
      driverExplanation: 'BIM quantity 12,610 m³ against 12,400 m³ (+1.7%), within the ±3% tolerance; the supplier (Saudi Readymix Concrete Company) has 95% delivery performance and a two-day lead time. No action required.',
      evidence: { excerpt: 'C60 ready-mix concrete · BoQ 12,400 m³ · BIM 12,610 m³ · Difference +1.7% · Supplier SUP7 · Compliant' },
      recommendation: {
        action: 'No action — routine monitoring with the monthly model update.',
        rationale: 'Within tolerance.',
        impact: 'No change',
      },
      responseParams: { Procurement: { supplier: 'Saudi Readymix Concrete Company', alternates: ['Al-Rajhi Concrete Company'] } },
      history: [
        { text: 'Automatically detected — score 16 (Green), confidence 94%' },
        { text: 'Closed automatically: variance within tolerance and specification compliant' },
      ],
      residualAssessment: { justification: 'Risk accepted: quantity within tolerance and specification compliant — no further treatment.' },
      outcome: 'Closed automatically: variance within tolerance and specification compliant.',
      dataQuality: {
        issues: [
          { text: 'Field completeness 95.3% (target 97%)' },
          { text: 'Data consistency 96.9% (target 97%)' },
          { text: 'Quarantined record awaiting review: BIM-S5-31.23.010' },
          { text: 'Quarantined record awaiting review: BIM-S1-08.01.040 v39' },
        ],
      },
    },
    AR55: {
      title: '10% performance security — standard clause (§4.2)',
      driverExplanation: 'An unconditional 10% bank guarantee consistent with the Government Tenders and Procurement Law; renewal is due within 38 days and is in the obligations calendar.',
      evidence: {
        excerpt: 'The Contractor shall provide an unconditional bank performance security of 10% of the Contract Price, valid until the end of the defects notification period.',
      },
      recommendation: { action: 'No action — reminder to renew 14 days before expiry.', rationale: 'Standard clause.', impact: 'No change' },
      history: [
        { text: 'Automatically detected — score 16 (Green), confidence 95%' },
        { text: 'Closed: standard clause with no exposure; renewal added to the obligations calendar' },
      ],
      residualAssessment: { justification: 'Risk accepted: standard 10% performance bond — no further treatment.' },
      outcome: 'Closed: standard clause with no exposure; renewal added to the obligations calendar.',
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR56: {
      title: '60% chance of rain coinciding with roof waterproofing and open drainage trenches',
      driverExplanation: 'The weather service forecasts thunderstorms (45–60%) on days three and four with 28 km/h winds; bitumen roof waterproofing (B2130) is moisture-sensitive and drainage network trenches are open to 2.4 m depth. The activity is not critical (9 days of float).',
      evidence: { excerpt: 'Jeddah: d+2 rain 45%, wind 22 km/h · d+3 rain 60%, wind 28 km/h · Humidity 78–82%' },
      recommendation: {
        action: 'Postpone laying the waterproofing rolls to day five and cover the open trenches, with dewatering pumps on standby.',
        rationale: 'Protects waterproofing quality and prevents wet trench sides from collapsing.',
        impact: 'Reduces the score to ~12',
      },
      responseParams: {
        Site: {
          location: 'Roofs of Buildings A and B · Drainage network and manholes',
          hazard: 'Trench collapse / slippage — rain',
          controls: ['Cover the trenches', 'Dewatering pumps', 'Postpone waterproofing'],
        },
      },
      history: [{ text: 'Automatically detected — score 36 (Green), confidence 78%' }],
      dataQuality: { sourceName: 'National Center for Meteorology (NCM)' },
    },
    AR57: {
      title: 'Building C finishes ahead of plan (81% against 79%)',
      driverExplanation: 'Activity B2110 (finishes on Floors 5–9) is at 68%, with the subcontractor at 81% progress against 79% planned, a scorecard of 86/100 and 12 days of float. Delay probability only 0.18.',
      evidence: {
        excerpt: 'Unit finishes — Building C (Floors 5–9) · % Complete 68 · Float 12 · Delay probability 0.18 · Subcontractor SC4 scorecard 86',
      },
      recommendation: {
        action: 'No action — part of the finishing crew could be moved to support Building A after commissioning.',
        rationale: 'Performance is positive; an opportunity to redeploy resources.',
        impact: 'No change',
      },
      history: [{ text: 'Automatically detected — score 24 (Green), confidence 86%' }],
    },
    AR58: {
      title: 'Staged taking over permitted — favourable clause (§10.1)',
      driverExplanation: 'Clause 10.1 allows each building to be taken over individually and starts the defects notification period for each building from its taking-over date, reducing delay damages exposure on completed buildings (A and B).',
      evidence: {
        excerpt: 'The Employer may take over any building individually once its works are complete, and the defects notification period for each building starts from its taking-over date.',
      },
      recommendation: {
        action: 'Apply for taking over of Building A as soon as commissioning is complete to activate the clause.',
        rationale: 'Turns a favourable clause into an actual reduction in exposure.',
        impact: 'No change',
      },
      history: [
        { text: 'Automatically detected — score 24 (Green), confidence 92%' },
        { text: 'Closed: favourable clause; partial taking-over request added to the obligations calendar' },
      ],
      residualAssessment: { justification: 'Risk accepted: staged taking-over is a favourable clause — no further treatment.' },
      outcome: 'Closed: favourable clause; partial taking-over request added to the obligations calendar.',
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR59: {
      title: 'Tracker pile positions deviate 32 mm — within the 50 mm tolerance',
      driverExplanation: 'Comparing the as-built survey with the BIM model for the North sector (4,120 piles) shows a maximum deviation of 32 mm and an average of 11 mm, within the 50 mm tolerance in the tracker structure specification. Only 6 piles exceeded 40 mm and were corrected with adjustment brackets.',
      recommendation: {
        action: 'No action — continue surveying every 500 piles in the South sector.',
        rationale: 'Within tolerance.',
        impact: 'No change',
      },
      responseParams: {
        Site: {
          location: 'Panel field — North sector',
          hazard: 'As-built deviation from design',
          controls: ['Periodic survey every 500 piles'],
        },
      },
      history: [{ text: 'Automatically detected — score 32 (Green), confidence 90%' }],
      dataQuality: {
        issues: [
          { text: 'Field completeness 95.3% (target 97%)' },
          { text: 'Data consistency 96.9% (target 97%)' },
          { text: 'Quarantined record awaiting review: BIM-S5-31.23.010' },
          { text: 'Quarantined record awaiting review: BIM-S1-08.01.040 v39' },
        ],
      },
    },
    AR60: {
      title: 'Euro exposure on inverters (8% of the budget) — partially hedged',
      driverExplanation: 'European inverters and transformers account for 8% of the budget (SAR 192 million); the euro rose 3.1% in 30 days. Treasury has hedged 70% of the remaining payments with forward contracts; net exposure is ~SAR 1.7 million for every 3% move.',
      evidence: {
        ref: 'FX-EUR · S3 exposure',
        excerpt: 'EUR/SAR 4.36 (+3.1% 30d) · Exposure SAR 192 million · Hedged 70% (FX-2026-121/122) · Net SAR 57.6 million',
      },
      recommendation: {
        action: 'Raise the hedge ratio to 90% at the first dip of the euro below 4.33.',
        rationale: 'A tactical improvement with limited impact.',
        impact: 'Reduces the score to ~20',
      },
      history: [
        { text: 'Automatically detected — score 36 (Green), confidence 80%' },
        { text: 'Dismissed: treasury policy caps hedging at 70% for freely traded currencies; net exposure is acceptable' },
      ],
      dataQuality: { sourceName: 'Exchange rates (SAMA)' },
    },
    AR61: {
      title: 'Warehouse 2 roof close-in (D4020) on schedule with a delay probability of 0.31',
      driverExplanation: 'Critical activity D4020 is at 68% against 66% planned and its date of d+27 matches the baseline; the subcontractor (Steel Contractors) has a scorecard of 84/100. Delay probability 0.31 with a 5-day impact linked only to two forecast windy days.',
      evidence: {
        excerpt: 'Warehouse 2 roof close-in · % Complete 68 · Finish d+27 · Baseline d+27 · Float 0 · Delay probability 0.31 · Expected delay 5 d',
      },
      recommendation: {
        action: 'No action — schedule side panel installation on the two windy days.',
        rationale: 'Within tolerance.',
        impact: 'No change',
      },
      history: [{ text: 'Automatically detected — score 24 (Green), confidence 84%' }],
    },
    AR62: {
      title: 'Steel structures item at +4.3% with a favourable CPI of 1.03',
      driverExplanation: 'WBS 4.3 is forecast at SAR 96 million against 92 (+4.3%) due to an 11% rise in the steel index; the project as a whole, with CPI 1.03 and a positive VAC (+SAR 9 million), absorbs the variance.',
      evidence: { excerpt: 'Steel structures · Budget 92,000,000 · Forecast 96,000,000 (+4.3%) · CPI 1.03 · VAC +9,029,126' },
      recommendation: {
        action: 'No action — monitor the steel index monthly.',
        rationale: 'Absorbed within project performance.',
        impact: 'No change',
      },
      history: [{ text: 'Automatically detected — score 24 (Green), confidence 85%' }],
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR63: {
      title: 'Steel frames: model quantity +3.4%, within tolerance',
      driverExplanation: 'BIM quantity 7,030 t against 6,800 t (+3.4%), within the ±5% tolerance; the supplier has a 45-day lead time and the order date (d−15) was met.',
      evidence: {
        excerpt: 'Structural steel · BoQ 6,800 t · BIM 7,030 t · Difference +3.4% · Supplier SUP8 · Compliant · Purchase order issued',
      },
      recommendation: { action: 'No action.', rationale: 'Within tolerance.', impact: 'No change' },
      responseParams: { Procurement: { supplier: 'Jubail Steel Structures Factory', alternates: ['Zamil Steel'] } },
      history: [{ text: 'Automatically detected — score 16 (Green), confidence 92%' }],
      dataQuality: {
        issues: [
          { text: 'Field completeness 95.3% (target 97%)' },
          { text: 'Data consistency 96.9% (target 97%)' },
          { text: 'Quarantined record awaiting review: BIM-S5-31.23.010' },
          { text: 'Quarantined record awaiting review: BIM-S1-08.01.040 v39' },
        ],
      },
    },
    AR64: {
      title: '45-day payment term with late-payment compensation — balanced clause (§14.7)',
      driverExplanation: 'Clause 14.7 sets payment within 45 days of the Engineer\'s approval with financing charges for delay; the actual average payment time for the last 6 certificates is 41 days.',
      evidence: {
        excerpt: 'The Employer shall pay each payment certificate within 45 days of the Engineer\'s approval, and financing charges are due on any delay.',
      },
      recommendation: { action: 'No action.', rationale: 'A balanced clause that is being complied with.', impact: 'No change' },
      history: [
        { text: 'Automatically detected — score 16 (Green), confidence 94%' },
        { text: 'Closed automatically: clause within the market benchmark with no flags' },
      ],
      residualAssessment: { justification: 'Risk accepted: balanced payment terms with late-payment compensation — no further treatment.' },
      outcome: 'Closed automatically: clause within the market benchmark, no flags.',
      dataQuality: { sourceName: 'BILTIX — Contracts', issues: [{ text: 'Quarantined record awaiting review: CT-2026-052 §18.2' }] },
    },
    AR65: {
      title: '630 mm HDPE pipes: model quantity +6.6% with a short lead time (14 days)',
      driverExplanation: 'BIM quantity 13,650 m against 12,800 m (+850 m = SAR 587 thousand) due to the road diversion (CO-018); the lead time is 14 days and the need date is 75 days away, so there is no time pressure, and the supplier is local with 94% performance.',
      evidence: {
        excerpt: '630 mm PN10 HDPE pipes · BoQ 12,800 m · BIM 13,650 m · Difference +6.6% · Supplier SUP11 · Lead time 14 days · Need date d+75',
      },
      recommendation: {
        action: 'Update the BoQ when CO-018 is approved and issue the purchase order before d+55.',
        rationale: 'Ties the increase to the change order so it can be recovered.',
        impact: 'Reduces the score to ~15',
      },
      responseParams: { Procurement: { supplier: 'Riyadh HDPE Plastic Pipes Factory', alternates: ['Eastern Pipes Company'] } },
      history: [{ text: 'Automatically detected — score 32 (Green), confidence 89%' }],
      dataQuality: {
        issues: [
          { text: 'Field completeness 95.3% (target 97%)' },
          { text: 'Data consistency 96.9% (target 97%)' },
          { text: 'Quarantined record awaiting review: BIM-S5-31.23.010' },
          { text: 'Quarantined record awaiting review: BIM-S1-08.01.040 v39' },
        ],
      },
    },
    AR66: {
      title: '2,000 kVA standby generators delivered to site and inspected — 180-day lead time completed',
      driverExplanation: 'Both generators arrived 9 days before the need date and passed receiving inspection; the supplier (National Transformers Company) is struggling on the NEOM project, but this item is closed from a supply perspective. Installation is at 85%.',
      evidence: { excerpt: '2,000 kVA standby generators — 2 units · Received d−9 · Receiving inspection: compliant · Installation 85%' },
      recommendation: { action: 'Confirm receipt and close the risk.', rationale: 'Supply is complete.', impact: 'No change' },
      responseParams: { Procurement: { supplier: 'National Transformers Company' } },
      history: [
        { text: 'Automatically detected — score 24 (Green), confidence 96%' },
        { text: 'Manual task MT-0227: follow up generator shipping weekly given the supplier\'s difficulties on another project' },
        { text: 'Closed: both generators received and inspected (GRN-2026-0912)' },
      ],
      residualAssessment: {
        justification: 'Both generators were received and inspected (GRN-2026-0912) 9 days before they are needed; the delay risk no longer exists.',
      },
      outcome: 'Closed: both generators received and inspected (GRN-2026-0912).',
      treatment: {
        plan: 'Follow up standby generator shipping weekly until delivery',
        evidence: [{ title: 'Goods received note GRN-2026-0912 — two 2,000 kVA generators' }],
      },
      dataQuality: {
        issues: [
          { text: 'Quarantined record awaiting review: ERP-PO-2026-0512-L3' },
          { text: 'Quarantined record awaiting review: ERP-CL-S3-3.4-OCT' },
        ],
      },
    },
    AR67: {
      title: 'Generator and fuel tank installation (F6120) at 85% with 8 days of float',
      driverExplanation: 'Activity F6120 is not critical (8 days of float), at 85%, and finishes at d+9 in line with the baseline; delay probability 0.15 with a one-day impact.',
      evidence: {
        excerpt: 'Standby generators and fuel tanks installation — Basement · % Complete 85 · Finish d+9 · Baseline d+9 · Float 8 · Delay probability 0.15',
      },
      recommendation: { action: 'No action.', rationale: 'Within tolerance.', impact: 'No change' },
      history: [{ text: 'Automatically detected — score 32 (Green), confidence 90%' }],
    },
    AR68: {
      title: 'Combustible materials accumulating in the Floor 2 corridor — resolved within 24 hours',
      driverExplanation: 'The vision model detected cardboard and solvent containers accumulating in the Floor 2 escape corridor in the 1 November report (high fire load near welding works). They were removed the next day and have not recurred in the 7 subsequent reports.',
      evidence: {
        excerpt: 'Image 9 — Escape corridor, Floor 2: cardboard and solvents 4 m from a welding point · Detection: fire load on an escape route (confidence 0.79)',
      },
      recommendation: {
        action: 'Remove the materials and designate a temporary storage area for combustible materials away from escape routes.',
        rationale: 'A simple administrative control.',
        impact: 'Reduces the score to ~10',
      },
      responseParams: {
        Site: {
          location: 'Expansion tower — Floor 2, east escape corridor',
          hazard: 'Fire load on an escape route',
          controls: ['Remove the materials', 'Designated storage area', 'Daily corridor inspection'],
        },
      },
      history: [
        { text: 'Automatically detected — score 32 (Green), confidence 79%' },
        { text: 'Recommendation accepted; task MT-0228' },
        { text: 'Closed: materials removed and a storage area designated; no recurrence' },
      ],
      residualAssessment: {
        justification: 'Materials were removed within 24 hours and a storage area was assigned; the potential fire impact is unchanged and the likelihood is now low.',
      },
      outcome: 'Closed: materials removed and a storage area assigned; no recurrence.',
      treatment: {
        plan: 'Remove combustible materials from the Floor 2 corridor and designate a storage area',
        evidence: [{ title: 'Before/after photos of the level-2 corridor clearance' }],
      },
      dataQuality: {
        sourceName: 'BILTIX — Images',
        issues: [
          { text: '95.4% of records passed schema checks (target 97%)' },
          { text: 'Field completeness 91.4% (target 97%)' },
          { text: 'Data consistency 95% (target 97%)' },
          { text: 'Quarantined record awaiting review: IMG-S3-20261108-031' },
        ],
      },
    },
    AR69: {
      title: 'Curtain-wall glass approval MAR-S1-CW-014 on hold — threatens supply and the A1100 start on the critical path',
      driverExplanation: "The curtain-wall glass submittal (MAR-S1-CW-014 Rev 1) is held by the consultant pending the employer's decision on change order CO-034. The latest purchase-order date passed 14 days ago and the supplier's production-slot hold ends on 24 November. If approval comes on the last day of the hold, the first units arrive 28 days after critical activity A1100 (zero float) needs them; if the hold is lost, the delay grows to about 50 days.",
      evidence: {
        excerpt: "Material submittal — double-glazed low-E IGUs and aluminium framing · Rev 0: Code C · Rev 1: under review (review period 14 days) · Consultant's note: awaiting the employer's decision on CO-034",
      },
      recommendation: {
        action: 'Urgent review meeting within 24 hours to approve Rev 1 conditionally (Code B) on the contract specification for floors 8–15, deferring CO-034 to after floor 15, and release the PO the same day inside the slot hold; split A1100 into two parallel packages.',
        rationale: 'Keeps the production slot and brings the A1100 finish from +28 back to about +4 days (illustrative).',
        impact: 'Reduces the score to ~32',
        alternatives: [
          'Pre-qualify an alternative supplier for 30% of the quantity (floors 12–15) as a hedge',
          'Wait for the CO-034 decision (+28 days, and the slot is lost if the decision is late)',
        ],
      },
      responseParams: {
        Procurement: {
          supplier: 'Gulf Façades Company',
          alternates: ['Architectural Glass Factory — Dammam', 'Modern Façades Company — Jeddah'],
        },
        Legal: { clauseRef: 'CT-2026-014 §20.1, §13.1 and §8.4 · CT-2026-021 §5.4' },
        Site: {
          location: 'S1-Z2 lift zone below TC-2 + King Fahd Road service lane (AP1)',
          hazard: 'Compressed façade lifting: night lifts, two crews at height, overlapping crane slewing radii',
          controls: ['Critical-lift plan per unit type', 'TC-1/TC-2 overlap zoning', 'Night-work permit and extra operators', 'Stop lifting at 38 km/h or a stricter limit'],
        },
      },
      history: [{ text: 'Automatically detected — score 80 (Red), confidence 81%' }],
    },
  },
  tasks: {
    MT1: {
      title: 'Negotiate a 10% cap on delay damages and convert them to 0.1% per day — CT-2026-014 §8.7',
      writeback: { target: 'BILTIX PM' },
    },
    MT2: {
      title: 'Amend the payment term to 30 days + arrange a payment certificate financing facility (SAR 150 million)',
      writeback: { target: 'BILTIX PM' },
    },
    MT3: {
      title: 'Stop pouring on Floor 23 until edge protection is installed on all three sides and the inspection is documented',
      writeback: { target: 'BILTIX PM' },
    },
    MT4: {
      title: 'Re-plan general overheads and lock the steel price for Floors 28–30 with a forward supply contract',
      writeback: { target: 'BILTIX PM' },
    },
    MT5: {
      title: 'Escalate the Building C permanent power application with the Saudi Electricity Company and send an extension of time notice',
      writeback: { target: 'BILTIX PM' },
    },
    MT6: { title: 'Transfer 8 lift technicians from the Financial Gateway Tower project for 5 weeks', writeback: { target: 'BILTIX PM' } },
    MT7: {
      title: 'Resident inspection team at the transformer factory + tie payment to the FAT milestone + standby contract for an alternative transformer',
      writeback: { target: 'BILTIX PM' },
    },
    MT8: {
      title: 'Extension of time notice for the late grid connection agreement and negotiation of an "adjusted commercial operation date"',
      writeback: { target: 'BILTIX PM' },
    },
    MT9: {
      title: 'Freeze changes in WBS 3.4, submit CO-052 and fix the price formula for shipments 5–8',
      writeback: { target: 'BILTIX PM' },
    },
    MT10: {
      title: 'Interpretative addendum on the performance ratio test methodology (IEC 61724-1) — §9.4',
      writeback: { target: 'BILTIX PM' },
    },
    MT11: { title: 'Close gate G2, divert port trucks and post a gate marshal during lifting', writeback: { target: 'BILTIX PM' } },
    MT12: {
      title: 'Send the notice of claim for unforeseeable geotechnical conditions before the deadline lapses (§20.1)',
      writeback: { target: 'BILTIX PM' },
    },
    MT13: {
      title: 'Tender a second excavation front with a second blasting contractor and resequence backfill on completed sections',
      writeback: { target: 'BILTIX PM' },
    },
    MT14: {
      title: 'Evacuate 25 m below the north face, stop blasting within 100 m and design slope stabilisation',
      writeback: { target: 'BILTIX PM' },
    },
    MT15: {
      title: 'PPE checkpoint at the blasting area entrance and link violations to the deduction clause',
      writeback: { target: 'BILTIX PM' },
    },
    MT16: {
      title: 'Contract 5 certified medical gas technicians and transfer medical copper pipes from the Jeddah project',
      writeback: { target: 'BILTIX PM' },
    },
    MT17: {
      title: 'Structural review of wall W-L25, approve the repair method and inspect the Floor 26 formwork',
      writeback: { target: 'BILTIX PM' },
    },
    MT18: {
      title: 'Endorse the subcontractor onto the CAR policy and require a SAR 20 million professional indemnity policy',
      writeback: { target: 'BILTIX PM' },
    },
    MT19: {
      title: 'Reject tile batch 4 and replace it at the supplier\'s cost + a local supplier for 30% of the remainder',
      writeback: { target: 'BILTIX PM' },
    },
    MT20: { title: 'Move 40 technicians from the North sector to the South sector for 3 weeks', writeback: { target: 'BILTIX PM' } },
    MT21: {
      title: 'Activate the dust suppression plan and submit the Q3 quarterly environmental report',
      writeback: { target: 'BILTIX PM' },
    },
    MT22: {
      title: 'Addendum adjusting the steel price threshold to 10% in both the main contract and the subcontract',
      writeback: { target: 'BILTIX PM' },
    },
    MT23: {
      outcome: '18 workers retrained and a safety officer appointed; no observations in the following week\'s images. The model\'s recommendation was sufficient.',
      title: 'Retrain the roofing crew on lifelines and assign a safety officer on the roof',
      writeback: { target: 'BILTIX PM' },
    },
    MT24: {
      title: 'Repair the gaps in the south fence, raise it to 2.4 m and patrol before every blast',
      writeback: { target: 'BILTIX PM' },
    },
    MT25: { title: 'Joint acceptance test protocol (HTM 02-01 + NFPA 99) as an addendum to Clause 9.1', writeback: { target: 'BILTIX PM' } },
    MT26: {
      title: 'Agree the night shutdown schedule with hospital management and test the generators under full load',
      writeback: { target: 'BILTIX PM' },
    },
    MT27: {
      outcome: 'Both generators received and inspected (GRN-2026-0912) 9 days before the need date.',
      title: 'Follow up standby generator shipping weekly until delivery',
      writeback: { target: 'BILTIX PM' },
    },
    MT28: {
      outcome: 'Materials removed within 24 hours and a storage area designated; no recurrence in 7 subsequent reports.',
      title: 'Remove combustible materials from the Floor 2 corridor and designate a storage area',
      writeback: { target: 'BILTIX PM' },
    },
  },
  alerts: {
    AL1: { title: 'Immediate escalation: 33/380 kV transformer supply from a distressed supplier — score 100' },
    AL2: { title: 'Immediate escalation: 2B rock excavation at 17% — forecast slip of 63 days — score 100' },
    AL3: { title: 'Immediate escalation: uncapped delay damages CT-2026-014 §8.7 — score 100' },
    AL4: { title: 'Immediate escalation: geotechnical notice of claim deadline expires within days — score 100' },
    AL5: { title: 'Immediate escalation: north excavation slope instability — movement of 14 mm/week — score 100' },
    AL6: { title: 'Manual escalation: Building C permanent power connection delayed — 94 days without an inspection date' },
    AL7: { title: 'Alert: SAR 1.2 million per day damages tied to a date outside the Contractor\'s control — score 80' },
    AL8: { title: 'Alert: SAR 62.8 million change order unapproved and earthworks item at +21% — score 80' },
    AL9: { title: 'Alert: EAC exceeds budget by SAR 237 million — CPI 0.91' },
    AL10: { title: 'Alert: performance ratio test methodology undefined — §9.4 — score 80' },
    AL11: { title: 'Alert: panel concentration on a single supplier and third shipment 19 days late — score 80' },
    AL12: { title: 'Alert: panel lifting with 46 km/h winds forecast — South sector — score 80' },
    AL13: { title: 'Alert: curtain wall installation start (A1100) slipping — score 80' },
    AL14: { title: 'Alert: rock excavation quantity in the model 20% above the BoQ — score 80' },
    AL15: { title: 'Alert: exposed slab edges without edge protection — Floor 23 — score 80' },
    AL16: { title: 'Alert: single-source curtain wall supplier with order date passed — score 80' },
    AL17: { title: 'Alert: lift technician shortfall threatens the Building A contractual date — score 80' },
    AL18: { title: 'Alert: unauthorised entry into the steel erection area — Warehouse 3 — score 80' },
    AL19: { title: 'Alert: hearing protection not worn in the blasting area — 38% — score 80' },
    AL20: { title: 'Alert: forecast budget overrun of SAR 118 million — CPI 0.94 — score 80' },
    AL21: { title: 'Alert: copper cable quantity up 9.8% as copper prices rise — score 80' },
    AL22: { title: 'Alert: medical gas technician shortfall threatens network testing — score 80' },
    AL23: { title: 'Alert: yuan exposure of 22% of the budget with no hedge — score 64' },
    AL24: { title: 'Alert: explosives permit expires within 19 days — score 64' },
    AL25: { title: 'Alert: dust storms excluded from force majeure — score 64' },
    AL26: { title: 'Alert: fence breaches near the blasting exclusion zone — score 64' },
    AL27: { title: 'Alert: medical systems acceptance criterion "to the Employer\'s satisfaction" — §9.1 — score 64' },
    AL28: { title: 'Alert: no contractors\' all risks insurance for façade materials — §18.2 — score 64' },
    AL29: { title: 'Alert: export restrictions excluded from force majeure — §19.1 — score 64' },
    AL30: { title: 'Alert: 14 non-recoverable dust storm stoppage days — §19.1 — score 64' },
    AL31: { title: 'Alert: BESS containers — the model requires 64 containers against 60 — score 64' },
    AL32: { title: 'Alert: final lift shipment arrives only 13 days before commissioning — score 64' },
    AL33: { title: 'Alert: medical copper pipes — order date passed by 21 days — score 64' },
    AL34: { title: 'Alert: 90-day payment term with no late-payment compensation — CT-2026-014 §14.2 — score 80' },
    AL35: { title: 'Alert: steel price adjustment gap between the main contract and the subcontract — score 64' },
    AL36: { title: 'Alert: 32 mm reinforcing steel — model quantity 8.5% above the BoQ — score 64' },
    AL37: { title: 'Alert: curtain-wall glass approval MAR-S1-CW-014 on hold — score 80' },
  },
  terms: {
    // People (owners, managers, inspectors, reporters, approvers, workers)
    'أ. فيصل الحربي — المستشار القانوني': 'Mr. Faisal Al-Harbi — Legal Counsel',
    'محرك العقود NLP': 'Contract NLP engine',
    'النظام': 'System',
    'م. هيا الدوسري': 'Eng. Haya Al-Dosari',
    'أ. فيصل الحربي': 'Mr. Faisal Al-Harbi',
    'أ. نوف السديري — مديرة المالية': 'Ms. Nouf Al-Sudairi — Finance Director',
    'م. خالد العتيبي': 'Eng. Khalid Al-Otaibi',
    'أ. نوف السديري': 'Ms. Nouf Al-Sudairi',
    'م. سعود الحارثي — مدير التخطيط': 'Eng. Saud Al-Harthi — Planning Manager',
    'نموذج الجدول الزمني': 'Schedule model',
    'م. سارة القحطاني': 'Eng. Sarah Al-Qahtani',
    'مهندس الموقع': 'Site engineer',
    'ذكاء الموقع (الصور والتقارير)': 'Site intelligence (images and reports)',
    'م. بدر القرني — مدير المشتريات': 'Eng. Badr Al-Qarni — Procurement Manager',
    'محرك توقع المواد BoM': 'BoM forecasting engine',
    'محرك توقع التكلفة': 'Cost forecasting engine',
    'م. نورة الزهراني': 'Eng. Noura Al-Zahrani',
    'م. سعود الحارثي': 'Eng. Saud Al-Harthi',
    'م. فهد الشمري': 'Eng. Fahad Al-Shammari',
    'م. بدر القرني': 'Eng. Badr Al-Qarni',
    'م. لمى العنزي': 'Eng. Lama Al-Anazi',
    'م. مها الغامدي': 'Eng. Maha Al-Ghamdi',
    'م. ريم السبيعي': 'Eng. Reem Al-Subaie',
    'م. تركي المطيري': 'Eng. Turki Al-Mutairi',
    'م. ماجد الأنصاري': 'Eng. Majed Al-Ansari',
    'م. هند الحربي': 'Eng. Hind Al-Harbi',
    // Organisations, contractors, authorities and systems
    'شركة الخليج للواجهات': 'Gulf Façades Company',
    'شركة الواجهات الحديثة — جدة': 'Modern Façades Company — Jeddah',
    'مصنع الزجاج المعماري — الدمام': 'Architectural Glass Factory — Dammam',
    'Biltix — الصور': 'BILTIX — Images',
    'مصانع الكابلات السعودية': 'Saudi Cable Company',
    'الشركة السعودية للكابلات الكهربائية': 'Saudi Electrical Cables Company',
    'مصنع الرياض للكابلات': 'Riyadh Cables Factory',
    'شركة المحولات الوطنية': 'National Transformers Company',
    'الشركة السعودية للمحولات — الدمام': 'Saudi Transformers Company — Dammam',
    'مصنع هيونداي للمحولات — الجبيل': 'Hyundai Transformers Factory — Jubail',
    'مصنع شنغهاي للألواح الكهروضوئية': 'Shanghai Photovoltaic Panel Factory',
    'مصنع جيانغسو للخلايا الشمسية': 'Jiangsu Solar Cells Factory',
    'الشركة السعودية لتصنيع الألواح — سدير': 'Saudi Panel Manufacturing Company — Sudair',
    'الشركة العربية للحفريات': 'Arabian Excavation Company',
    'شركة الجزيرة للتفجير والمحاجر': 'Al-Jazeera Blasting and Quarries Company',
    'مؤسسة الصخور للمقاولات': 'Al-Sukhour Contracting Establishment',
    'بوابة الحساسات (MQTT)': 'Sensor gateway (MQTT)',
    'مصانع الكابلات السعودية (أنابيب نحاس طبي)': 'Saudi Cable Company (medical copper pipes)',
    'شركة الغازات الطبية المتحدة': 'United Medical Gases Company',
    'مخزون مشروع مجمع البحر الأحمر': 'Red Sea Residential Compound project stock',
    'مصنع الراجحي للحديد': 'Al-Rajhi Steel Factory',
    'حديد الاتفاق': 'Al-Ittefaq Steel',
    'شركة الراجحي للصناعات الحديدية — فرع جدة': 'Al-Rajhi Steel Industries Company — Jeddah Branch',
    'مصنع راجستان للبلاط والسيراميك': 'Rajasthan Tiles and Ceramics Factory',
    'شركة الخزف السعودي': 'Saudi Ceramic Company',
    'مصنع الجوهرة للسيراميك': 'Al-Jawhara Ceramics Factory',
    'شركة المصاعد الأوروبية المحدودة': 'European Elevators Company Ltd',
    'أسعار الصرف (ساما)': 'Exchange rates (SAMA)',
    'مصنع شنتشن لأنظمة تخزين الطاقة BESS': 'Shenzhen Energy Storage Systems (BESS) Factory',
    'مصنع نينغده لتخزين الطاقة': 'Ningde Energy Storage Factory',
    'مصنع شنغهاي للألواح / مصنع شنتشن BESS': 'Shanghai Photovoltaic Panel Factory / Shenzhen BESS Factory',
    'إعادة التسعير بالدولار': 'Repricing in US dollars',
    'مقاولو الصلب': 'Steel Contractors',
    'مصنع الجبيل للهياكل الفولاذية (توريد مباشر)': 'Jubail Steel Structures Factory (direct supply)',
    'الشركة التركية للألمنيوم والنوافذ': 'Turkish Aluminium and Windows Company',
    'مصنع الألواح المعزولة — الدمام': 'Insulated Panels Factory — Dammam',
    'شركة كيربي للمباني الجاهزة': 'Kirby Building Systems',
    'الشركة اللوجستية للمحروقات': 'Logistics Fuels Company',
    'أرامكو — التوريد المباشر للمشاريع': 'Aramco — direct supply to projects',
    'الشركة السعودية للخرسانة الجاهزة': 'Saudi Readymix Concrete Company',
    'شركة الراجحي للخرسانة': 'Al-Rajhi Concrete Company',
    'مصنع الجبيل للهياكل الفولاذية': 'Jubail Steel Structures Factory',
    'شركة الزامل للحديد': 'Zamil Steel',
    'مصنع الرياض للأنابيب البلاستيكية HDPE': 'Riyadh HDPE Plastic Pipes Factory',
    'شركة أنابيب الشرق': 'Eastern Pipes Company',
    // Other repeated free strings (course names, currencies, sensor kinds, body parts, source systems, toolbox topics)
    'Biltix — العقود': 'BILTIX — Contracts',
    'Biltix — تقارير الموقع': 'BILTIX — Site reports',
    'المركز الوطني للأرصاد': 'National Center for Meteorology (NCM)',
    'بوابة الحساسات': 'Sensor gateway',
    'أسعار الصرف': 'Exchange rates',
    'مؤشرات السلع': 'Commodity indices',
  },
};
