# server/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from switch import sendcommand, CMDCODE
import time  # time.sleep을 위해 추가
from switch import readstatus
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

app = Flask(__name__)
CORS(app)

# 장치별 필드 매핑 추가
field_to_device = {
    'window_1': '천창1',
    'window_2': '천창2',
    'curtain_1': '차광1',
    'curtain_2': '차광2',
    'curtain_3': '보온1',
    'side_curtain': '측커텐'
}

# 제어 퍼센트 매핑 추가
control_mapping = {
    'window_control': ['천창1', '천창2'],
    'curtain1_control': '차광1',
    'curtain2_control': '차광2',
    'curtain3_control': '보온1',
    'side_curtain_control': '측커텐'
}

# 유동팬과 송풍기의 레지스터 주소
fan_register = 4  # 504로 계산됨
blower_register = 28  # 528로 계산됨

# 각 장치의 레지스터 주소 정의
device_registers = {
    '천창1': 36,    
    '천창2': 40,    
    '차광1': 48,    
    '차광2': 54,   
    '보온1': 56,   
    '측커텐': 60,  
    '유동팬': 4,   
    '송풍기': 28   
}

TOTAL_TIMES = {
    '천창1': 480,
    '천창2': 480,
    '차광1': 920,
    '차광2': 940,
    '보온1': 930,
    '측커텐': 40
}

# InfluxDB 설정
INFLUXDB_URL = "http://163.180.105.106:8086"
INFLUXDB_TOKEN = "EZaynBT4HpIL8XAV5YOCzAx2i40XXZ-I1yZHy1cetuNMb0A6LP_9MpqX8pAVWgJZmR2x6ctNjL_jPeYwxHG09Q=="
INFLUXDB_ORG = "14d05f5e7dc06789"
INFLUXDB_BUCKET = "DB_bucket"

client = InfluxDBClient(
    url=INFLUXDB_URL,
    token=INFLUXDB_TOKEN,
    org=INFLUXDB_ORG
)

@app.route('/status', methods=['GET'])
def get_status():
    print("Status 요청 받음!")
    try:
        # 초기 상태 설정
        current_states = {
            '천창1': {'value': 'OFF', 'type': None},
            '천창2': {'value': 'OFF', 'type': None},
            '차광1': {'value': 'OFF', 'type': None},
            '차광2': {'value': 'OFF', 'type': None},
            '보온1': {'value': 'OFF', 'type': None},
            '측커텐': {'value': 'OFF', 'type': None},
            '유동팬': False,
            '송풍기': False
        }
        query_api = client.query_api()
        
        # 퍼센트 조회 쿼리
        percent_query = f'''
        from(bucket: "{INFLUXDB_BUCKET}")
            |> range(start: -1h)
            |> filter(fn: (r) => r["_measurement"] == "control_status")
            |> filter(fn: (r) => r["_field"] =~ /(curtain[1-3]_control|side_curtain_control|window_control|fan|heater)/)
            |> group(columns: ["_field"])
            |> last()
        '''

        # 쿼리 실행
        percent_result = query_api.query(percent_query)

        # 디버깅을 위한 로그 추가
        print("Query results:")
        for table in percent_result:
            for record in table.records:
                print(f"Field: {record.get_field()}, Value: {record.get_value()}")

        # 퍼센트값 처리
        for table in percent_result:
            for record in table.records:
                field = record.get_field()
                value = record.get_value()
                
                if field == 'fan':
                    current_states['유동팬'] = value == 201
                elif field == 'heater':
                    current_states['송풍기'] = value == 201
                elif field in control_mapping:
                    devices = control_mapping[field]
                    if isinstance(devices, list):
                        for device in devices:
                            current_states[device]['value'] = f"{value}%"
                            current_states[device]['type'] = 'CLOSE' if value == 0.0 else 'OPEN'
                    else:
                        current_states[devices]['value'] = f"{value}%"
                        current_states[devices]['type'] = 'CLOSE' if value == 0.0 else 'OPEN'
        print("응답 데이터:", current_states)
        return jsonify(current_states)
    
    
    except Exception as e:
        print(f"상태 조회 중 에러 발생: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@app.route('/control', methods=['POST'])
def control_device():
    data = request.json
    device = data.get('device')
    action = data.get('action')  # 'open' 또는 'close'
    percentage = data.get('percentage', 'OFF')
    MAX_RETRIES = 3

    try:
        if device in TOTAL_TIMES and percentage != 'OFF':
            # 선택된 퍼센트 값
            selected_percent = float(percentage.replace('%', ''))
            
            # 현재 InfluxDB 퍼센트 조회
            query_api = client.query_api()
            current_percent_query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
                |> range(start: -1h)
                |> filter(fn: (r) => r["_measurement"] == "control_status")
                |> filter(fn: (r) => r["_field"] =~ /(curtain[1-3]_control|side_curtain_control|window_control)/)
                |> group(columns: ["_field"])
                |> last()
            '''
            
            results = query_api.query(current_percent_query)
            current_percent = 0.0
            for table in results:
                for record in table.records:
                    field = record.get_field()
                    if field in control_mapping and control_mapping[field] == device:
                        current_percent = float(record.get_value())

            # 새로운 퍼센트 계산 (0.0~100.0 범위 제한)
            if action == 'open':
                new_percent = min(max(current_percent + selected_percent, 0.0), 100.0)
            else:  # close
                new_percent = min(max(current_percent - selected_percent, 0.0), 100.0)

            # 장치 제어 시간 계산
            target_time = int(TOTAL_TIMES[device] * (selected_percent / 100))
            
            # 장치 제어
            success = False
            retry_count = 0
            while not success and retry_count < MAX_RETRIES:
                try:
                    if action == 'open':
                        sendcommand(CMDCODE.TIMED_OPEN, device_registers[device], device, target_time)
                    else:  # close
                        sendcommand(CMDCODE.TIMED_CLOSE, device_registers[device], device, target_time)
                    success = True
                except Exception as e:
                    retry_count += 1
                    if retry_count < MAX_RETRIES:
                        time.sleep(1)

            if success:
                # InfluxDB 업데이트
                write_api = client.write_api(write_options=SYNCHRONOUS)
                control_field = next(field for field, device_name in control_mapping.items() if device_name == device)
                point = Point("control_status") \
                    .field(control_field, new_percent)
                write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)

                return jsonify({"status": "success"})

        return jsonify({"status": "success"})

    except Exception as e:
        print(f"에러 발생: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
    
@app.route('/reset', methods=['POST'])
def reset_devices():
    try:
        # 유동팬과 송풍기 초기화
        for device in ['유동팬', '송풍기']:
            device_type = 'fan' if device == '유동팬' else 'blower'
            sendcommand(CMDCODE.OFF, device_registers[device], device_type)

        # 시간 제어 장치들 초기화
        for device in TOTAL_TIMES:
            close_time = TOTAL_TIMES[device] + 30  # 전체 시간 + 30초
            sendcommand(CMDCODE.OFF, device_registers[device], device)  # 먼저 정지
            sendcommand(CMDCODE.TIMED_CLOSE, device_registers[device], device, close_time)

        return jsonify({
            "status": "success",
            "message": "모든 장치가 초기화되었습니다."
        })
    except Exception as e:
        print(f"초기화 중 에러 발생: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
    
if __name__ == '__main__':
    # CORS 설정 추가
    CORS(app, resources={
        r"/api/*": {
            "origins": ["http://localhost:3000", "http://163.180.105.108"],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type"]
        }
    })
    app.run(host='0.0.0.0', port=5000, debug=True)
    
    