"""Reproducible planning scenarios, not a forecast. Python 3, standard library only.

Run from any directory: python3 docs/strategy/models.py
Writes only analytical outputs beside this file; no network, DB or application imports.
All rates are assumptions except the explicitly described LiveKit list-price inputs.
"""
from pathlib import Path
import json
import math

OUT = Path(__file__).resolve().parent
SIZES = [1_000, 10_000, 100_000, 1_000_000]
SCENARIOS = {
    'Пессимистичный': dict(conversion=.01, price=4.99, fee=.30, churn=.30,
        cac_paid=12, paid_share=.60, voice=180, sessions=8, reports_per_1000=12,
        handling=12, wage=22, support_rate=.025, support_minutes=10,
        verify_price=.8, verify_pass=.80),
    'Базовый': dict(conversion=.04, price=5.99, fee=.20, churn=.18,
        cac_paid=6, paid_share=.35, voice=90, sessions=6, reports_per_1000=3,
        handling=8, wage=22, support_rate=.008, support_minutes=6,
        verify_price=.3, verify_pass=.90),
    'Оптимистичный': dict(conversion=.08, price=6.99, fee=.15, churn=.10,
        cac_paid=3, paid_share=.20, voice=60, sessions=5, reports_per_1000=1,
        handling=6, wage=22, support_rate=.004, support_minutes=5,
        verify_price=.15, verify_pass=.95),
}
FLOORS = {
    'api': [80, 180, 600, 2500], 'db': [80, 200, 900, 4000],
    'redis': [20, 40, 150, 800], 'storage': [10, 20, 100, 500],
    'other_traffic': [10, 30, 100, 500], 'observability': [30, 60, 300, 1500],
    'auth': [20, 40, 150, 500], 'mod_hours': [40, 120, 400, 1200],
    'support_hours': [10, 30, 100, 400],
    'team': [6000, 14000, 45000, 160000],
    'legal_admin': [500, 1000, 4000, 15000],
    'organic_marketing': [200, 1000, 7000, 25000],
}
RATES = dict(api=.025, db=.018, redis=.006, storage=.002,
             other_traffic=.004, observability=.007, auth=.005)

def calculate(n, p):
    i = SIZES.index(n)
    c = {k: max(FLOORS[k][i], n * rate) for k, rate in RATES.items()}
    # Stage plans: Ship for <100k MAU, Scale otherwise. Not capacity guarantees.
    base, allowance, rate, gb_allowance, gb_rate = (
        (50, 150_000, .0005, 250, .12) if n < 100_000
        else (500, 1_500_000, .0004, 3000, .10))
    pm = n * p['voice']
    # Two received audio streams, 32 kbps each, 30% protocol/retransmission overhead.
    gb = pm * 2 * 32_000 * 60 / 8 / 1_000_000_000 * 1.30
    c['voice_connection'] = base + max(0, pm - allowance) * rate
    c['voice_traffic'] = max(0, gb - gb_allowance) * gb_rate
    cases = n * p['sessions'] * p['reports_per_1000'] / 1000
    mod_hours = max(FLOORS['mod_hours'][i], cases * p['handling'] / 60 / .65)
    c['moderation'] = mod_hours * p['wage']
    support_hours = max(FLOORS['support_hours'][i],
        n * p['support_rate'] * p['support_minutes'] / 60 / .70)
    c['support'] = support_hours * p['wage']
    replacements = n * p['churn']
    # Conservative: every replacement is a new identity, not a free reactivation.
    c['age_verification'] = replacements / p['verify_pass'] * p['verify_price']
    cogs = sum(c.values())
    gross = n * p['conversion'] * p['price']
    commission = gross * p['fee']
    net = gross - commission
    gross_profit = net - cogs
    paid_marketing = replacements * p['paid_share'] * p['cac_paid']
    organic_marketing = FLOORS['organic_marketing'][i]
    team, legal = FLOORS['team'][i], FLOORS['legal_admin'][i]
    opex = paid_marketing + organic_marketing + team + legal
    contribution = gross_profit / n
    cac_blended = (paid_marketing + organic_marketing) / replacements
    ltv = contribution / p['churn'] if contribution > 0 else None
    conversion_break_even = (cogs + opex) / (n * p['price'] * (1-p['fee']))
    return dict(scenario_params=p, mau=n, costs=c, voice_participant_minutes=pm,
        voice_gb=gb, cases=cases, moderation_hours=mod_hours, support_hours=support_hours,
        replacements=replacements, payers=n*p['conversion'], gross_revenue=gross,
        store_commission=commission, net_revenue=net, cogs=cogs,
        gross_profit=gross_profit, gross_margin=gross_profit/net if net else None,
        paid_marketing=paid_marketing, organic_marketing=organic_marketing,
        team=team, legal_admin=legal, opex=opex, operating_result=gross_profit-opex,
        gross_arpu=gross/n, net_arpu=net/n, contribution_per_active=contribution,
        cac_blended=cac_blended, ltv_active=ltv,
        ltv_cac=ltv/cac_blended if ltv is not None else None,
        break_even_conversion=conversion_break_even)

WEIGHTS = [10,10,18,8,14,6,6,8,6,10,4]
CRITERIA = ['Привлечение','Первая ценность','Удержание','Органика','Cold start',
            'Монетизация','Простота разработки','Дешевизна модерации',
            'Регуляторная устойчивость','Повторные связи','Международность']
SCORES = {
    'A Litmatch Improved':[3,5,2,2,1,3,3,2,1,2,4],
    'B Party First':[4,3,3,4,1,3,2,1,2,3,4],
    'C Social Life Platform':[4,2,4,4,3,4,1,2,2,4,2],
    'D Повторные малые круги':[3,2,4,3,4,2,3,3,3,5,3],
}

def weighted(weights):
    return {name:sum(w*s for w,s in zip(weights,scores))/sum(weights)
            for name,scores in SCORES.items()}

def wilson(success, total):
    p, z = success/total, 1.96
    center=(p+z*z/(2*total))/(1+z*z/total)
    half=z*math.sqrt(p*(1-p)/total+z*z/(4*total*total))/(1+z*z/total)
    return [center-half, center+half]

def fmt(v):
    return 'неприменимо' if v is None else f'{v:,.2f}'.replace(',', ' ')

def table(headers, rows):
    return '\n'.join(['| '+' | '.join(headers)+' |','|'+'|'.join(['---']*len(headers))+'|']+
        ['| '+' | '.join(fmt(x) if isinstance(x,(float,int)) else str(x) for x in row)+' |' for row in rows])

def main():
    assert sum(WEIGHTS)==100
    results={name:[calculate(n,p) for n in SIZES] for name,p in SCENARIOS.items()}
    for rows in results.values():
        for r in rows:
            assert math.isclose(sum(r['costs'].values()),r['cogs'])
            assert math.isclose(r['gross_revenue']-r['store_commission']-r['cogs']-r['opex'],r['operating_result'])
            assert r['voice_participant_minutes']==r['mau']*r['scenario_params']['voice']
    sensitivity={}
    for churn in [.10,.18,.30]:
        for voice in [0,90,180,360]:
            p={**SCENARIOS['Базовый'],'churn':churn,'voice':voice}
            sensitivity[f'churn={churn};voice={voice}']=calculate(100_000,p)
    # Voice=0 sensitivity still reserves Scale base fee; text-only cancellation saves $500 more.
    payload=dict(as_of='2026-10-25',assumption_notice='Planning model, not a forecast',
        scenarios=results,sensitivity_100k=sensitivity,weights=dict(zip(CRITERIA,WEIGHTS)),
        strategy_scores=SCORES,weighted_scores=weighted(WEIGHTS),
        fast_value_weights_scores=weighted([10,30,13,8,4,6,6,8,6,5,4]),
        d_retention_and_friendship_minus_one=weighted(WEIGHTS)['D Повторные малые круги']-.28,
        wilson_40_of_100=wilson(40,100),
        coldstart=[dict(mau=n,average_ccu=n*.2*25/1440) for n in [100,1000,10000]],
        arrival_per_hour_for_90percent_2min=math.log(10)/2*60)
    OUT.joinpath('financial_model.json').write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n')
    lines=['# Расчётные таблицы — 25 октября 2026','',
        'Генерируется `models.py`. USD/месяц; все сценарии условные. Метод и ограничения — [BUSINESS_MODEL.md](BUSINESS_MODEL.md).','']
    for name,rows in results.items():
        lines += ['## '+name,'',table(['MAU','Платящие','Gross','Комиссия','Net','COGS','Валовая маржа %','OPEX','Опер. результат'],
            [[r['mau'],r['payers'],r['gross_revenue'],r['store_commission'],r['net_revenue'],r['cogs'],r['gross_margin']*100,r['opex'],r['operating_result']] for r in rows]),'']
        lines += [table(['Статья / MAU']+[str(n) for n in SIZES],
            [[k]+[r['costs'][k] for r in rows] for k in rows[0]['costs']]+[
            [k]+[r[k] for r in rows] for k in ['paid_marketing','organic_marketing','team','legal_admin']]),'']
        lines += [table(['MAU','Gross ARPU','Net ARPU','Contribution/active','Blended CAC/active','LTV/active','LTV/CAC','Безубыт. платящая конверсия %'],
            [[r['mau'],r['gross_arpu'],r['net_arpu'],r['contribution_per_active'],r['cac_blended'],r['ltv_active'],r['ltv_cac'],r['break_even_conversion']*100] for r in rows]),'']
    lines += ['## Чувствительность базового сценария, 100 000 MAU','',
        table(['Monthly active churn %','Voice participant-min / MAU','Опер. результат','COGS','LTV/active'],
        [[r['scenario_params']['churn']*100,r['scenario_params']['voice'],r['operating_result'],r['cogs'],r['ltv_active']] for r in sensitivity.values()]),'',
        'При voice=0 сохранена плата Scale $500; отмена голосового тарифа уменьшит расходы ещё на $500.','',
        '## Стратегии','',table(['Стратегия','Базовые веса','Высокий вес первой ценности'],
        [[k,v,payload['fast_value_weights_scores'][k]] for k,v in payload['weighted_scores'].items()]),'']
    OUT.joinpath('MODEL_OUTPUT.md').write_text('\n'.join(lines))
    print(json.dumps({name:{'operating_1m':r[-1]['operating_result'],
        'breakeven_conversion_1m':r[-1]['break_even_conversion']} for name,r in results.items()},ensure_ascii=False))
    print('Validation passed: 12 scenarios; arithmetic identities; weights total 100.')

if __name__ == '__main__':
    main()
