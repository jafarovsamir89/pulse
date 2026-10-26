"""PULSE v0.4 planning model. Standard library only; no network or app imports.
Run: python3 docs/strategy/models.py. All business inputs are assumptions.
LiveKit rate snapshot is documented in BUSINESS_MODEL.md; capacity is not guaranteed.
"""
from pathlib import Path
import json
import math

OUT = Path(__file__).resolve().parent
SIZES = [1000, 10000, 100000, 1000000]
SCENARIOS = {
    "Пессимистичный": dict(host_conversion=.005,host_price=7.99,cosmetic_conversion=.01,basket=3.99,
        fee=.30,refund=.03,churn=.30,cac_paid=12,paid_share=.60,voice=45,
        completed_participations=4,completion=.65,mean_players=2.5,reports_per_1000=12,
        handling=12,wage=22,support_rate=.025,support_minutes=10,verify_price=.8,verify_pass=.8),
    "Базовый": dict(host_conversion=.01,host_price=7.99,cosmetic_conversion=.03,basket=4.99,
        fee=.20,refund=.02,churn=.18,cac_paid=6,paid_share=.35,voice=20,
        completed_participations=6,completion=.80,mean_players=3,reports_per_1000=3,
        handling=8,wage=22,support_rate=.008,support_minutes=6,verify_price=.3,verify_pass=.9),
    "Оптимистичный": dict(host_conversion=.03,host_price=9.99,cosmetic_conversion=.06,basket=5.99,
        fee=.15,refund=.01,churn=.10,cac_paid=3,paid_share=.20,voice=10,
        completed_participations=8,completion=.90,mean_players=3,reports_per_1000=1,
        handling=6,wage=22,support_rate=.004,support_minutes=5,verify_price=.15,verify_pass=.95),
}
FLOORS = dict(api=[80,180,600,2500],db=[80,200,900,4000],redis=[20,40,150,800],
    storage=[10,20,100,500],other_traffic=[10,30,100,500],observability=[30,60,300,1500],
    auth=[20,40,150,500],mod_hours=[40,120,400,1200],support_hours=[10,30,100,400],
    team=[6000,14000,45000,160000],legal_admin=[500,1000,4000,15000],
    organic_marketing=[200,1000,7000,25000],content=[300,900,4000,15000])
RATES = dict(api=.025,db=.018,redis=.006,storage=.002,other_traffic=.004,observability=.007,auth=.005)

def voice_cost(n, minutes):
    if minutes == 0:
        return 0., 0., 0.
    base, allowance, rate, gb_allow, gb_rate = ((50,150000,.0005,250,.12)
        if n < 100000 else (500,1500000,.0004,3000,.10))
    pm=n*minutes
    gb=pm*2*32000*60/8/1e9*1.30
    return base+max(0,pm-allowance)*rate,max(0,gb-gb_allow)*gb_rate,gb

def calculate(n,p):
    i=SIZES.index(n)
    assert 0 < p["completion"] <= 1 and p["mean_players"] >= 2
    assert p["host_conversion"]+p["cosmetic_conversion"] <= 1
    participations=n*p["completed_participations"]
    attempts=participations/p["completion"]
    matches=participations/p["mean_players"]
    # Infrastructure budgets are assumptions, not vendor quotes or measured capacity.
    costs={k:max(FLOORS[k][i],n*rate*(p["completed_participations"]/6 if k in ("api","db","redis") else 1))
           for k,rate in RATES.items()}
    costs["voice_connection"],costs["voice_traffic"],gb=voice_cost(n,p["voice"])
    cases=attempts*p["reports_per_1000"]/1000
    mod_hours=max(FLOORS["mod_hours"][i],cases*p["handling"]/60/.65)
    support_hours=max(FLOORS["support_hours"][i],n*p["support_rate"]*p["support_minutes"]/60/.70)
    costs["moderation"]=mod_hours*p["wage"]
    costs["support"]=support_hours*p["wage"]
    replacements=n*p["churn"]
    costs["age_verification"]=replacements/p["verify_pass"]*p["verify_price"]
    costs["content"]=FLOORS["content"][i]
    host=n*p["host_conversion"]*p["host_price"]
    cosmetic=n*p["cosmetic_conversion"]*p["basket"]
    gross=host+cosmetic
    refunds=gross*p["refund"]
    commission=(gross-refunds)*p["fee"]
    net=gross-refunds-commission
    cogs=sum(costs.values())
    paid=replacements*p["paid_share"]*p["cac_paid"]
    organic=FLOORS["organic_marketing"][i]
    team=FLOORS["team"][i]
    legal=FLOORS["legal_admin"][i]
    opex=paid+organic+team+legal
    contribution=(net-cogs)/n
    cac=(paid+organic)/replacements
    ltv=contribution/p["churn"] if contribution>0 else None
    factor=(cogs+opex)/net
    return dict(mau=n,params=p,costs=costs,completed_participations=participations,
        attempted_participations=attempts,completed_matches=matches,voice_participant_minutes=n*p["voice"],
        voice_gb=gb,cases=cases,moderation_hours=mod_hours,support_hours=support_hours,
        replacements=replacements,initial_verification_oneoff=n/p["verify_pass"]*p["verify_price"],
        host_gross=host,cosmetic_gross=cosmetic,gross_revenue=gross,refunds=refunds,commission=commission,
        net_revenue=net,cogs=cogs,gross_profit=net-cogs,gross_margin=(net-cogs)/net,
        paid_marketing=paid,organic_marketing=organic,team=team,legal_admin=legal,opex=opex,
        operating_result=net-cogs-opex,gross_arpu=gross/n,net_arpu=net/n,
        payer_conversion=p["host_conversion"]+p["cosmetic_conversion"],
        contribution_per_active=contribution,cac_blended=cac,ltv_active=ltv,
        ltv_cac=ltv/cac if ltv is not None else None,
        cogs_per_completed_match=cogs/matches,full_cost_per_completed_match=(cogs+opex)/matches,
        break_even_revenue_factor=factor,
        break_even_payer_conversion_same_mix=(p["host_conversion"]+p["cosmetic_conversion"])*factor)

def wilson(s,n):
    z=1.96
    center=(s/n+z*z/(2*n))/(1+z*z/n)
    half=z*math.sqrt((s/n)*(1-s/n)/n+z*z/(4*n*n))/(1+z*z/n)
    return [center-half,center+half]

def fmt(x):
    if x is None: return "неприменимо"
    return f"{x:,.2f}".replace(","," ") if isinstance(x,(int,float)) else str(x)

def table(headers,rows):
    return "\n".join(["| "+" | ".join(headers)+" |","|"+"|".join(["---"]*len(headers))+"|"]+
        ["| "+" | ".join(map(fmt,row))+" |" for row in rows])

def main():
    results={name:[calculate(n,p) for n in SIZES] for name,p in SCENARIOS.items()}
    sensitivity=[]
    for churn in [.10,.18,.30]:
        for voice in [0,20,90,180]:
            sensitivity.append(calculate(100000,{**SCENARIOS["Базовый"],"churn":churn,"voice":voice}))
    stress=calculate(1000000,{**SCENARIOS["Оптимистичный"],"fee":.30})
    for r in [row for rows in results.values() for row in rows]+sensitivity+[stress]:
        assert math.isclose(sum(r["costs"].values()),r["cogs"])
        assert math.isclose(r["gross_revenue"]-r["refunds"]-r["commission"],r["net_revenue"])
        assert math.isclose(r["net_revenue"]-r["cogs"]-r["opex"],r["operating_result"])
        assert math.isclose(r["completed_matches"]*r["params"]["mean_players"],r["completed_participations"])
        assert math.isclose(r["cogs_per_completed_match"]*r["completed_matches"],r["cogs"])
        assert r["attempted_participations"]>=r["completed_participations"]
    assert voice_cost(1000,0)==(0.,0.,0.)
    assert calculate(1000,{**SCENARIOS["Базовый"],"completion":.5})["cases"]>calculate(1000,SCENARIOS["Базовый"])["cases"]
    assert calculate(100000,{**SCENARIOS["Базовый"],"voice":90})["cogs"]>calculate(100000,{**SCENARIOS["Базовый"],"voice":20})["cogs"]
    payload=dict(version="0.4",as_of="2026-10-25",notice="Hypothetical planning model, not forecast",
        scenarios=results,sensitivity_100k=sensitivity,optimistic_fee30_1m=stress,
        wilson_40_of_100=wilson(40,100),
        coldstart=[dict(mau=n,avg_ccu=n*.2*25/1440) for n in [100,1000,10000]],
        arrival_per_hour_90percent_two_minutes=math.log(10)/2*60)
    OUT.joinpath("financial_model.json").write_text(json.dumps(payload,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    lines=["# PULSE — расчёты v0.4", "", "25.10.2026. USD/месяц. Генерируется models.py; условные сценарии, не прогноз. [Метод](BUSINESS_MODEL.md).",""]
    for name,rows in results.items():
        lines+=["## "+name,"",table(["MAU","Gross","Refunds","Комиссия","Net","COGS","OPEX","Результат"],
          [[r[k] for k in ["mau","gross_revenue","refunds","commission","net_revenue","cogs","opex","operating_result"]] for r in rows]),""]
        lines+=[table(["Статья / MAU"]+list(map(str,SIZES)),
          [[k]+[r["costs"][k] for r in rows] for k in rows[0]["costs"]]+
          [[k]+[r[k] for r in rows] for k in ["paid_marketing","organic_marketing","team","legal_admin","initial_verification_oneoff"]]),""]
        lines+=[table(["MAU","Матчи","COGS/матч","Полная цена/матч","Net ARPU","Валовая маржа %","CAC/active","LTV/active","LTV/CAC","Безуб. платящая доля %"],
          [[r["mau"],r["completed_matches"],r["cogs_per_completed_match"],r["full_cost_per_completed_match"],
            r["net_arpu"],r["gross_margin"]*100,r["cac_blended"],r["ltv_active"],r["ltv_cac"],
            r["break_even_payer_conversion_same_mix"]*100] for r in rows]),""]
    lines+=["## Чувствительность: базовый, 100k","",table(["Churn %","Voice min/MAU","COGS","Опер. результат"],
      [[r["params"]["churn"]*100,r["params"]["voice"],r["cogs"],r["operating_result"]] for r in sensitivity]),"",
      "## Стресс комиссии","",f"Оптимистичный 1M с комиссией 30%: {fmt(stress['operating_result'])} USD/месяц.","",
      "Безубыточная доля предполагает неизменные цены, расходы и пропорцию двух непересекающихся групп покупателей. Значение >100% означает невозможность при таких условиях.",
      "Initial verification — разовая справочная стоимость, не включена в месячный результат. В voice=0 голосовой тариф отменён."]
    OUT.joinpath("MODEL_OUTPUT.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
    print(json.dumps({k:{"result_1m":v[-1]["operating_result"],"breakeven_share":v[-1]["break_even_payer_conversion_same_mix"]} for k,v in results.items()},ensure_ascii=False))
    print("Validated 12 scenarios, 12 sensitivities, identities, units and directional checks.")

if __name__=="__main__":
    main()
