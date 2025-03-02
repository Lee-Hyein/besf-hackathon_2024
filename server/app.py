# server/app.py
from flask import Flask, request, jsonify
from flask_cors import CORS
from switch import sendcommand, CMDCODE
import time  # time.sleep을 위해 추가
from switch import readstatus
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS
from datetime import timedelta
import datetime

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

# TOTAL_TIMES = {
#     '천창1': 450,
#     '천창2': 460,
#     '차광1': 950,
#     '차광2': 950,
#     '보온1_열림': 960,
#     '보온1_닫힘': 950,
#     '측커텐_열림': 50,
#     '측커텐_닫힘': 40
# }

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

# operation mode 조회 엔드포인트
@app.route('/operation-mode', methods=['GET'])
def get_operation_mode():
    try:
        query = f'''
            from(bucket: "{INFLUXDB_BUCKET}")
            |> range(start: -1h)
            |> filter(fn: (r) => r["_measurement"] == "operation_mode")
            |> filter(fn: (r) => r["_field"] == "mode")
            |> last()
        '''
        
        result = client.query_api().query(query, org=INFLUXDB_ORG)
        tables = list(result)
        
        # 결과가 없는 경우 기본값으로 AUTO(0) 반환
        if not result or len(result) == 0:
            return jsonify({"mode": 0})
            
        # 마지막 레코드의 값 반환
        for table in result:
            for record in table.records:
                return jsonify({"mode": record.get_value()})
                
    except Exception as e:
        app.logger.error(f"운영 모드 조회 중 오류 발생: {str(e)}")
        return jsonify({"error": "운영 모드 조회 실패"}), 500

# operation mode 변경 엔드포인트
@app.route('/operation-mode', methods=['POST'])
def set_operation_mode():
    try:
        data = request.get_json()
        mode = data.get('mode')
        
        if mode is None or mode not in [0, 1]:
            return jsonify({
                "status": "error",
                "message": "잘못된 모드 값"
            }), 400
        
        KST = datetime.timezone(datetime.timedelta(hours=9))
        current_time = datetime.datetime.now(KST)
            
        # InfluxDB에 데이터 쓰기
        point = Point("operation_mode") \
            .field("mode", mode) \
            .time(current_time)
            
        write_api = client.write_api(write_options=SYNCHRONOUS)
        write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)
        
        return jsonify({
            "status": "success",
            "message": "운영 모드가 변경되었습니다",
            "mode": mode
        })
        
    except Exception as e:
        app.logger.error(f"운영 모드 변경 중 오류 발생: {str(e)}")
        return jsonify({
            "status": "error",
            "message": "운영 모드 변경 실패"
        }), 500

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
    print(f"받은 제어 요청 데이터: {data}")  # 디버깅 로그 추가
    device = data.get('device')
    action = data.get('action')
    percentage = data.get('percentage', 'OFF')
    MAX_RETRIES = 3

    try:
        if device in ['유동팬', '송풍기']:
            print(f"ON/OFF 장치 제어 시도: {device}, 액션: {action}")  # 디버깅 로그
            success = False
            retry_count = 0
            while not success and retry_count < MAX_RETRIES:
                try:
                    command = CMDCODE.ON if action == 'on' else CMDCODE.OFF
                    device_type = 'fan' if device == '유동팬' else 'blower'
                    print(f"명령 전송: {command}, 레지스터: {device_registers[device]}")  # 디버깅 로그
                    sendcommand(command, device_registers[device], device)
                    success = True
                except Exception as e:
                    print(f"제어 시도 {retry_count + 1} 실패: {str(e)}")  # 디버깅 로그
                    retry_count += 1
                    if retry_count < MAX_RETRIES:
                        return jsonify({
                            "status": "retry",
                            "device": device,
                            "attempt": retry_count,
                            "max_retries": MAX_RETRIES,
                            "message": str(e)
                        }), 202
                    time.sleep(1)

            if success:
                write_api = client.write_api(write_options=SYNCHRONOUS)
                field = 'fan' if device == '유동팬' else 'heater'
                value = 201 if action == 'on' else 0
                point = Point("control_status") \
                    .field(field, value)
                write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)
                print(f"{device} 제어 성공")  # 디버깅 로그
                return jsonify({
                    "status": "success",
                    "device": device,
                    "wawRetried": retry_count > 0
                })

        elif device in TOTAL_TIMES and percentage != 'OFF':
            print(f"시간 제어 장치 제어 시도: {device}, 액션: {action}, 퍼센트: {percentage}")
            
            # InfluxDB에서 현재 퍼센트 값 조회
            query_api = client.query_api()
            field_name = None
            for field, devices in control_mapping.items():
                if isinstance(devices, list) and device in devices:
                    field_name = field
                elif devices == device:
                    field_name = field

            current_percent_query = f'''
                from(bucket: "{INFLUXDB_BUCKET}")
                    |> range(start: -1h)
                    |> filter(fn: (r) => r["_measurement"] == "control_status")
                    |> filter(fn: (r) => r["_field"] == "{field_name}")
                    |> last()
            '''
            
            result = query_api.query(current_percent_query)
            current_percent = 0.0
            for table in result:
                for record in table.records:
                    current_percent = record.get_value()

            # 새로운 퍼센트 계산
            new_percent = float(percentage.replace('%', ''))
            if action == 'close':
                target_percent = current_percent - new_percent
            else:  # open
                target_percent = current_percent + new_percent
            
            # 범위 제한 (0~100%)
            target_percent = max(0.0, min(100.0, target_percent))
            
            target_time = int(TOTAL_TIMES[device] * (new_percent / 100))
            
            success = False
            retry_count = 0
            while not success and retry_count < MAX_RETRIES:
                try:
                    if action == 'open':
                        print(f"OPEN 명령 전송: 시간 = {target_time}")
                        sendcommand(CMDCODE.TIMED_OPEN, device_registers[device], device, target_time)

                    else:  # close
                        print(f"CLOSE 명령 전송: 시간 = {target_time}")
                        sendcommand(CMDCODE.TIMED_CLOSE, device_registers[device], device, target_time)
                    success = True
                except Exception as e:
                    print(f"제어 시도 {retry_count + 1} 실패: {str(e)}")
                    retry_count += 1
                    if retry_count < MAX_RETRIES:
                        return jsonify({
                            "status": "retry",
                            "device": device,
                            "attempt": retry_count,
                            "max_retries": MAX_RETRIES,
                            "message": str(e)
                        }), 202
                    time.sleep(1)

            if success:
                write_api = client.write_api(write_options=SYNCHRONOUS)
                
                if field_name:
                    # 계산된 새로운 퍼센트 값을 InfluxDB에 저장
                    point = Point("control_status") \
                        .field(field_name, target_percent)
                    
                    write_api.write(bucket=INFLUXDB_BUCKET, org=INFLUXDB_ORG, record=point)
                    print(f"InfluxDB 업데이트 완료: {field_name} = {target_percent}")

                return jsonify({
                    "status": "success",
                    "device": device,
                    "wasRetried": retry_count > 0
                })

        return jsonify({"status": "success"})

    except Exception as e:
        print(f"제어 중 에러 발생: {str(e)}")
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
    
@app.route('/sensor-data', methods=['GET'])
def get_sensor_data():
    try: 
        print("센서 데이터 요청 받음!")
        query_api = client.query_api()

        # 현재 값 쿼리 수정
        current_query = '''
        from(bucket: "DB_bucket")
            |> range(start: -5m)
            |> filter(fn: (r) => r["_field"] == "in_hum" or r["_field"] == "in_temp" or r["_field"] == "co2" or r["_field"] == "rain_detector" or r["_field"] == "solar_rad")
            |> last()
        '''

        # 히스토리 쿼리 수정
        history_query = '''
        from(bucket: "DB_bucket")
            |> range(start: -24h)
            |> filter(fn: (r) => r["_field"] == "in_hum" or r["_field"] == "in_temp" or r["_field"] == "co2" or r["_field"] == "rain_detector" or r["_field"] == "solar_rad")
            |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
        '''

        print("쿼리 실행 시작...")
        current_result = query_api.query(current_query)
        history_result = query_api.query(history_query)
        print("쿼리 실행 완료")

        # 현재 값 초기화
        current_values = {
            'temperature': 0.0,
            'humidity': 0.0,
            'co2': 0.0,
            'rain': 0.0,
            'solar_radiation': 0.0
        }

        # 필드 매핑 수정
        field_mapping = {
            'in_temp': 'temperature',
            'in_hum': 'humidity',
            'co2': 'co2',
            'rain_detector': 'rain',
            'solar_rad': 'solar_radiation'
        }

        # 현재 값 처리
        for table in current_result:
            for record in table.records:
                field = record.get_field()
                if field in field_mapping:
                    current_values[field_mapping[field]] = record.get_value()
                    print(f"Found current value for {field}: {record.get_value()}")  # 디버깅용

        # 히스토리 데이터 초기화
        history_data = {
            'temperature': [],
            'humidity': [],
            'co2': [],
            'rain': [],
            'solar_radiation': []
        }

        # 히스토리 데이터 처리
        for table in history_result:
            for record in table.records:
                field = record.get_field()
                if field in field_mapping:
                    mapped_field = field_mapping[field]
                    record_time = record.get_time()
                    kst_time = record_time + timedelta(hours=9)
                    history_data[mapped_field].append({
                        "time": kst_time.strftime('%Y-%m-%d %H:%M:%S'),
                        "value": record.get_value()
                    })
                    # print(f"Found history value for {field} at {record.get_time()}: {record.get_value()}")  # 디버깅용

        print(f"현재 센서 데이터: {current_values}")
        print(f"이력 센서 데이터 샘플: {history_data['temperature'][:2]}")  # 처음 2개 항목만 출력
        
        return jsonify({
            "current": current_values,
            "history": history_data
        })
    except Exception as e:
        print(f"센서 데이터 조회 중 에러 발생: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
    
if __name__ == '__main__':
    # CORS 설정 추가
    CORS(app, resources={
        # r"/api/*": {
        r"/*": {
            "origins": ["http://localhost:3000", "http://163.180.105.108"],
            "methods": ["GET", "POST", "OPTIONS"],
            "allow_headers": ["Content-Type"]
        }
    })
    app.run(host='0.0.0.0', port=5000, debug=True)
    
    
    
    